// POST /api/game/order   （Authorization: Bearer <座位 token>）
// 送出本期決策。body: { week, order, ship? }
//   week  = 畫面上的期數，用來防止「已經進下一期卻送到舊的期」
//   order = 向上游訂貨量
//   ship  = 給下游出貨量（manualShipping 開啟時必填，上限 = view.maxShip）
// 結算前可以重送覆蓋。pacing = 'auto' 時全組都送出就會直接結算。
import { route, readBody, bearerToken, HttpError } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getSeatByToken, getGameState, tryAdvance, mapDbError } from '../_lib/game.js';
import { MAX_ORDER, getPlayerView } from '../../src/engine/index.js';

export default route(['POST'], async (req) => {
  const seat = await getSeatByToken(bearerToken(req));
  const body = readBody(req);
  const week = Number(body.week);
  const order = Number(body.order);
  if (!Number.isInteger(week) || week < 1) throw new HttpError(400, 'BAD_REQUEST', '缺少期數');
  if (!Number.isInteger(order) || order < 0 || order > MAX_ORDER) {
    throw new HttpError(400, 'INVALID_ORDER', `訂貨量必須是 0–${MAX_ORDER} 的整數`);
  }

  // 出貨量：先在這裡檢查上限，錯誤訊息比較友善；結算時引擎會再檢查一次
  const gs = await getGameState(seat.game_id);
  const view = getPlayerView(gs.state, seat.role);
  let ship = null;
  if (view.manualShipping) {
    ship = Number(body.ship);
    if (!Number.isInteger(ship) || ship < 0 || ship > view.maxShip) {
      throw new HttpError(
        400,
        'INVALID_SHIPMENT',
        `出貨量必須是 0–${view.maxShip} 的整數（可用存貨 ${view.inventory}、下游總需求 ${view.totalDemand}）`,
      );
    }
  }

  const { data: submittedRoles, error } = await db().rpc('submit_order', {
    p_game_id: seat.game_id,
    p_week: week,
    p_role: seat.role,
    p_quantity: order,
    p_ship: ship,
  });
  if (error) throw mapDbError(error);

  const result = await tryAdvance(seat.game_id);
  return { submittedRoles, advanced: result.advanced, finished: result.finished ?? false };
});
