// GET /api/game/state   （Authorization: Bearer <座位 token>）
// 回傳這位玩家看得到的資訊。前端在「收到 Realtime 通知」和「重新連線」時呼叫這支。
// 隊友只看得到「整組失分」的加總，看不到別人的存貨與訂單。
import { route, bearerToken, check } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getSeatByToken, getGameState, toRecord } from '../_lib/game.js';
import { getPlayerView, chainCost } from '../../src/engine/index.js';

export default route(['GET'], async (req) => {
  const seat = await getSeatByToken(bearerToken(req));
  const sb = db();

  const [game, gs, teammates, allRecords, myOrders] = await Promise.all([
    sb.from('games')
      .select('id, class_id, code, group_no, status, phase, current_week, submitted_roles')
      .eq('id', seat.game_id)
      .single()
      .then(check),
    getGameState(seat.game_id),
    sb.from('seats').select('role, nickname, controller').eq('game_id', seat.game_id).then(check),
    sb.from('round_records')
      .select('week, role, begin_inventory, received, incoming_order, total_demand, shipped, inventory, backlog, order_qty, order_source, week_cost, total_cost')
      .eq('game_id', seat.game_id)
      .order('week')
      .then(check),
    sb.from('orders')
      .select('week, quantity, ship_qty')
      .eq('game_id', seat.game_id)
      .eq('role', seat.role)
      .then(check),
    sb.from('seats').update({ last_seen_at: new Date().toISOString() }).eq('id', seat.id).then(check),
  ]);

  // 整組每期失分（加總，不透露個別角色）
  const groupWeekCost = new Map();
  for (const r of allRecords) groupWeekCost.set(r.week, (groupWeekCost.get(r.week) ?? 0) + Number(r.week_cost));
  let running = 0;
  const groupTotalByWeek = new Map();
  for (const [week, cost] of [...groupWeekCost].sort((a, b) => a[0] - b[0])) {
    running += cost;
    groupTotalByWeek.set(week, running);
  }

  const history = allRecords
    .filter((r) => r.role === seat.role)
    .map((r) => ({
      ...toRecord(r),
      groupWeekCost: groupWeekCost.get(r.week),
      groupTotalCost: groupTotalByWeek.get(r.week),
    }));

  const pending = myOrders.find((o) => o.week === game.current_week);

  return {
    game: {
      id: game.id,
      classId: game.class_id,
      code: game.code,
      groupNo: game.group_no,
      status: game.status, // waiting | playing | paused | finished
      phase: game.phase, // decision = 決策輸入中、result = 檢視上一期結算
      week: game.current_week, // 目前（或下一個）要決策的期數
      submittedRoles: game.submitted_roles,
    },
    seat: { role: seat.role, nickname: seat.nickname },
    teammates,
    rules: {
      holdingCost: gs.state.config.holdingCost,
      backlogCost: gs.state.config.backlogCost,
      manualShipping: gs.state.config.manualShipping,
      leadTime: gs.state.config.orderDelay + gs.state.config.shipDelay, // 訂貨到收貨的總期數
    },
    view: getPlayerView(gs.state, seat.role),
    groupTotalCost: chainCost(gs.state),
    mySubmission: pending ? { order: pending.quantity, ship: pending.ship_qty } : null,
    lastResult: history.at(-1) ?? null, // 結果頁要顯示的「上一期結算」
    history, // 由舊到新
  };
});
