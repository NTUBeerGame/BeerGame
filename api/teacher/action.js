// POST /api/teacher/action   （Authorization: Bearer <教師代碼>）
// body: { action, gameId?, force? }   不給 gameId = 全班一起
//
//   'start'    開始（或從暫停恢復）
//   'pause'    暫停
//   'resolve'  結算本期 → 學生跳到結果頁。
//              預設只結算「全員都送出」的組；force: true 時沒送出的人自動代下。
//   'nextWeek' 開啟下一期 → 學生回到決策輸入頁
import { route, readBody, bearerToken, HttpError, check, isUuid } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getClassByTeacherToken, tryAdvance } from '../_lib/game.js';

export default route(['POST'], async (req) => {
  const cls = await getClassByTeacherToken(bearerToken(req));
  const { action, gameId, force = false } = readBody(req);
  const sb = db();
  const now = () => new Date().toISOString();

  if (gameId != null && !isUuid(gameId)) throw new HttpError(404, 'GAME_NOT_FOUND', '這個班沒有這一組');

  // 確認 gameId 屬於這個班，避免老師 A 操作到老師 B 的組
  let query = sb.from('games').select('id, group_no').eq('class_id', cls.id);
  if (gameId) query = query.eq('id', String(gameId));
  const targets = check(await query);
  if (gameId && targets.length === 0) throw new HttpError(404, 'GAME_NOT_FOUND', '這個班沒有這一組');
  const ids = targets.map((g) => g.id);

  switch (action) {
    case 'start': {
      check(
        await sb.from('games').update({ status: 'playing', updated_at: now() })
          .in('id', ids).in('status', ['waiting', 'paused']),
      );
      // 自動節奏下，暫停期間大家可能都送出了 → 恢復時直接結算
      if (cls.config.pacing === 'auto') await Promise.all(ids.map((id) => tryAdvance(id)));
      return { ok: true };
    }
    case 'pause': {
      check(await sb.from('games').update({ status: 'paused', updated_at: now() }).in('id', ids).eq('status', 'playing'));
      return { ok: true };
    }
    case 'resolve': {
      const results = await Promise.all(
        targets.map(async (g) => ({
          groupNo: g.group_no,
          ...(await tryAdvance(g.id, { byTeacher: true, force: Boolean(force) })),
        })),
      );
      return {
        resolved: results.filter((r) => r.advanced).map((r) => r.groupNo),
        // 還有人沒送出的組；前端可以提示老師「要強制結算嗎？」再帶 force: true 重送
        notReady: results.filter((r) => r.waitingFor?.length).map((r) => ({ groupNo: r.groupNo, waitingFor: r.waitingFor })),
        results,
      };
    }
    case 'nextWeek': {
      check(
        await sb.from('games').update({ phase: 'decision', updated_at: now() })
          .in('id', ids).eq('phase', 'result').eq('status', 'playing'),
      );
      return { ok: true };
    }
    default:
      throw new HttpError(400, 'BAD_REQUEST', `未知的 action：${action}`);
  }
});
