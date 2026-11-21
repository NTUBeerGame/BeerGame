// 遊戲相關的資料庫操作。API 路由只負責解析參數，邏輯都在這裡。
import { db } from './supabase.js';
import { HttpError, check } from './http.js';
import { ROLES, advanceRound, autoOrder, getPlayerView } from '../../src/engine/index.js';

// 去掉容易混淆的 0/O、1/I/L
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** 插入一筆有唯一代碼欄位的資料；代碼撞到就重抽 */
export async function insertWithUniqueCode(table, row, column, select = '*') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db()
      .from(table)
      .insert({ ...row, [column]: generateCode() })
      .select(select)
      .single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // 23505 = 唯一值重複
  }
  throw new Error(`無法產生不重複的 ${table}.${column}`);
}

export async function getSeatByToken(token) {
  const seat = check(await db().from('seats').select('*').eq('token', token).maybeSingle());
  if (!seat) throw new HttpError(401, 'UNAUTHORIZED', '找不到這個座位，請重新加入');
  return seat;
}

export async function getClassByTeacherToken(token) {
  const cls = check(await db().from('classes').select('*').eq('teacher_token', token).maybeSingle());
  if (!cls) throw new HttpError(401, 'UNAUTHORIZED', '教師代碼無效');
  return cls;
}

export async function getGameState(gameId) {
  return check(await db().from('game_states').select('*').eq('game_id', gameId).single());
}

/** 碰一下 games.updated_at，讓訂閱這局（或這個班）的大廳、後台收到 Realtime 通知 */
export async function touchGame(gameId) {
  check(await db().from('games').update({ updated_at: new Date().toISOString() }).eq('id', gameId));
}

/**
 * 嘗試結算本期。
 * - pacing = 'auto'：學生送出決策時呼叫，所有真人都送出就結算，直接進下一期決策。
 * - pacing = 'teacher'：只有老師按「結算」（byTeacher）才會結算，結算後進入結果頁（phase = 'result'），
 *   等老師按「開啟下一期」。
 * - force：沒送出的真人也自動代下（標記為 timeout）。
 * 沒人坐的角色一律自動代下。多個請求同時呼叫是安全的：只有一個會成功。
 */
export async function tryAdvance(gameId, { force = false, byTeacher = false } = {}) {
  const sb = db();
  const [game, gs, seats] = await Promise.all([
    sb.from('games').select('id, status, phase').eq('id', gameId).single().then(check),
    getGameState(gameId),
    sb.from('seats').select('role, controller').eq('game_id', gameId).then(check),
  ]);
  if (game.status !== 'playing') return { advanced: false, reason: 'NOT_PLAYING' };
  if (game.phase !== 'decision') return { advanced: false, reason: 'NOT_DECISION_PHASE' };

  const state = gs.state;
  const pacing = state.config.pacing;
  if (pacing === 'teacher' && !byTeacher) return { advanced: false, reason: 'WAITING_TEACHER' };

  const week = gs.current_week;
  const rows = check(
    await sb.from('orders').select('role, quantity, ship_qty').eq('game_id', gameId).eq('week', week),
  );

  const humanRoles = new Set(seats.filter((s) => s.controller === 'human').map((s) => s.role));
  const orders = {};
  const shipments = {};
  for (const o of rows) {
    orders[o.role] = o.quantity;
    if (o.ship_qty != null) shipments[o.role] = o.ship_qty;
  }
  const waitingFor = [...humanRoles].filter((r) => !(r in orders));
  if (waitingFor.length > 0 && !force) return { advanced: false, waitingFor };

  // 自動代下（之後 Player Agent 就是接在這裡：controller === 'agent' 時改呼叫 LLM）
  // 出貨沒給 = 引擎自動出到最多
  const fills = [];
  for (const role of ROLES) {
    if (role in orders) continue;
    const quantity = autoOrder(getPlayerView(state, role));
    orders[role] = quantity;
    fills.push({ role, quantity, source: humanRoles.has(role) ? 'timeout' : 'auto' });
  }

  const { state: next, records, finished } = advanceRound(state, orders, shipments);
  const advanced = check(
    await sb.rpc('advance_game', {
      p_game_id: gameId,
      p_expected_version: gs.version,
      p_new_state: next,
      p_records: records,
      p_fills: fills,
      p_next_week: next.week,
      p_finished: finished,
      p_phase: pacing === 'teacher' ? 'result' : 'decision',
    }),
  );
  return { advanced, finished: advanced && finished };
}

/** 把 Postgres function 丟出的錯誤（NOT_PLAYING 等）轉成 HTTP 錯誤 */
export function mapDbError(err) {
  const msg = err?.message ?? '';
  if (msg.includes('NOT_PLAYING')) return new HttpError(409, 'NOT_PLAYING', '遊戲尚未開始或已暫停／結束');
  if (msg.includes('NOT_DECISION_PHASE')) {
    return new HttpError(409, 'NOT_DECISION_PHASE', '本期已結算，請等老師開啟下一期');
  }
  if (msg.includes('WEEK_MISMATCH')) return new HttpError(409, 'WEEK_MISMATCH', '已經進入下一期，請重新整理');
  if (msg.includes('GAME_NOT_FOUND')) return new HttpError(404, 'GAME_NOT_FOUND', '找不到遊戲');
  return err;
}

/** round_records 的 DB 欄位轉成前端用的 camelCase */
export function toRecord(r) {
  return {
    week: r.week,
    role: r.role,
    beginInventory: r.begin_inventory,
    received: r.received,
    incomingOrder: r.incoming_order,
    totalDemand: r.total_demand,
    shipped: r.shipped,
    inventory: r.inventory,
    backlog: r.backlog,
    order: r.order_qty,
    orderSource: r.order_source,
    weekCost: Number(r.week_cost),
    totalCost: Number(r.total_cost),
  };
}
