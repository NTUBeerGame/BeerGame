// POST /api/game/join
// 學生佔位。body: { gameId 或 code, nickname, role? }（role 不給就自動分配空位）
// 回傳的 token 要存在瀏覽器，之後所有請求都帶 Authorization: Bearer <token>
import { route, readBody, HttpError, check, isUuid } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { touchGame } from '../_lib/game.js';
import { ROLES } from '../../src/engine/index.js';

export default route(['POST'], async (req) => {
  const body = readBody(req);
  const nickname = String(body.nickname ?? '').trim().slice(0, 20);
  if (!nickname) throw new HttpError(400, 'BAD_REQUEST', '請輸入暱稱');
  if (body.role != null && !ROLES.includes(body.role)) {
    throw new HttpError(400, 'BAD_REQUEST', '角色不存在');
  }

  const sb = db();
  let query = sb.from('games').select('id, code, group_no, class_id, status');
  if (body.gameId) {
    if (!isUuid(body.gameId)) throw new HttpError(404, 'GAME_NOT_FOUND', '找不到這一組');
    query = query.eq('id', body.gameId);
  }
  else if (body.code) query = query.eq('code', String(body.code).trim().toUpperCase());
  else throw new HttpError(400, 'BAD_REQUEST', '缺少 gameId 或小組代碼');

  const game = check(await query.maybeSingle());
  if (!game) throw new HttpError(404, 'GAME_NOT_FOUND', '找不到這一組');
  if (game.status === 'finished') throw new HttpError(409, 'GAME_FINISHED', '這局已經結束');

  const seats = check(await sb.from('seats').select('role').eq('game_id', game.id));
  const taken = new Set(seats.map((s) => s.role));
  const role = body.role ?? ROLES.find((r) => !taken.has(r));
  if (!role) throw new HttpError(409, 'GAME_FULL', '這組四個角色都有人了');
  if (taken.has(role)) throw new HttpError(409, 'ROLE_TAKEN', '這個角色已經有人了');

  const { data: seat, error } = await sb
    .from('seats')
    .insert({ game_id: game.id, role, nickname })
    .select('token, role')
    .single();
  if (error?.code === '23505') throw new HttpError(409, 'ROLE_TAKEN', '這個角色剛被別人選走了');
  if (error) throw error;

  await touchGame(game.id);
  return {
    token: seat.token,
    gameId: game.id,
    classId: game.class_id,
    groupNo: game.group_no,
    role: seat.role,
  };
});
