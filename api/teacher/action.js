// POST /api/teacher/action   （Authorization: Bearer <教師代碼>）
// body: { action, gameId?, force? }   不給 gameId = 全班一起
//
//   'start'    開始（或從暫停恢復）
//   'pause'    暫停
//   'resolve'  結算本期 → 學生跳到結果頁。
//              預設只結算「全員都送出」的組；force: true 時沒送出的人自動代下。
//   'nextWeek' 開啟下一期 → 學生回到決策輸入頁
//   'end'      提前結束遊戲（學生不能再送出，但資料都還在，可以下載 CSV）
//   'deleteClass' 永久刪除整個班級的所有資料，body 要帶 confirm: 班級代碼（防止誤刪）
import { route, readBody, bearerToken, HttpError, check, isUuid } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getClassByTeacherToken, tryAdvance } from '../_lib/game.js';

export default route(['POST'], async (req) => {
  const cls = await getClassByTeacherToken(bearerToken(req));
  const { action, gameId, force = false, confirm } = readBody(req);
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
    case 'end': {
      check(
        await sb.from('games').update({ status: 'finished', updated_at: now() })
          .in('id', ids).in('status', ['waiting', 'playing', 'paused']),
      );
      return { ok: true };
    }
    case 'deleteClass': {
      if (gameId) throw new HttpError(400, 'BAD_REQUEST', '刪除只能針對整個班級');
      if (String(confirm ?? '').trim().toUpperCase() !== cls.join_code) {
        throw new HttpError(400, 'CONFIRM_MISMATCH', '班級代碼不正確，沒有刪除任何資料');
      }
      // 先把所有組設為結束：還開著畫面的學生會透過 Realtime 收到通知
      check(await sb.from('games').update({ status: 'finished', updated_at: now() }).eq('class_id', cls.id));
      // 刪除班級；組別、座位、決策、每期紀錄都設了 on delete cascade，會一起刪掉
      check(await sb.from('classes').delete().eq('id', cls.id));
      return { ok: true, deleted: true };
    }
    default:
      throw new HttpError(400, 'BAD_REQUEST', `未知的 action：${action}`);
  }
});
