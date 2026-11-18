// POST /api/game/leave   （Authorization: Bearer <座位 token>）
// 大廳的「放棄此位置」。只能在老師按開始之前離開；開始後座位要保留，避免那個角色變成無人。
// 想換角色 = leave + 用新角色 join（會拿到新的 token）。
import { route, bearerToken, HttpError, check } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getSeatByToken, touchGame } from '../_lib/game.js';

export default route(['POST'], async (req) => {
  const seat = await getSeatByToken(bearerToken(req));
  const sb = db();
  const game = check(await sb.from('games').select('status').eq('id', seat.game_id).single());
  if (game.status !== 'waiting') {
    throw new HttpError(409, 'GAME_STARTED', '遊戲已經開始，不能放棄位置');
  }
  check(await sb.from('seats').delete().eq('id', seat.id));
  await touchGame(seat.game_id);
  return { ok: true };
});
