// GET /api/class/lobby?code=<班級代碼>
// 大廳：列出這個班所有組別，以及每組哪些角色已經有人（只有暱稱，沒有任何 token）。
// 前端用 subscribeClass(classId) 收到通知後重新呼叫這支，就能即時看到別人佔位。
import { route, HttpError, check } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';

export default route(['GET'], async (req) => {
  const code = String(req.query?.code ?? '').trim().toUpperCase();
  if (!code) throw new HttpError(400, 'BAD_REQUEST', '請輸入班級代碼');

  const sb = db();
  const cls = check(await sb.from('classes').select('id, name, join_code').eq('join_code', code).maybeSingle());
  if (!cls) throw new HttpError(404, 'CLASS_NOT_FOUND', '找不到這個班級代碼');

  const games = check(
    await sb.from('games').select('id, group_no, code, status').eq('class_id', cls.id).order('group_no'),
  );
  const seats = games.length
    ? check(await sb.from('seats').select('game_id, role, nickname').in('game_id', games.map((g) => g.id)))
    : [];

  return {
    class: { id: cls.id, name: cls.name, joinCode: cls.join_code },
    groups: games.map((g) => ({
      gameId: g.id,
      groupNo: g.group_no,
      code: g.code,
      status: g.status,
      seats: Object.fromEntries(
        seats.filter((s) => s.game_id === g.id).map((s) => [s.role, s.nickname]),
      ), // 例如 { retailer: '小明', factory: '阿美' }
    })),
  };
});
