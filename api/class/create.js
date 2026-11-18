// POST /api/class/create
// 老師開班：建立班級 + N 個小組（每組一局）
// body: { name, groups, totalWeeks?, pacing?, manualShipping?, secret? }
import { route, readBody, HttpError, check } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { insertWithUniqueCode } from '../_lib/game.js';
import { makeConfig, createInitialState } from '../../src/engine/index.js';

export default route(['POST'], async (req) => {
  const body = readBody(req);

  // 設了 TEACHER_SECRET 就必須帶正確的 secret 才能開班，避免任何人都能建
  const secret = process.env.TEACHER_SECRET;
  if (secret && body.secret !== secret) throw new HttpError(403, 'FORBIDDEN', '開班密碼錯誤');

  const name = String(body.name ?? '').trim().slice(0, 60);
  const groups = Number(body.groups);
  if (!name) throw new HttpError(400, 'BAD_REQUEST', '請輸入班級名稱');
  if (!Number.isInteger(groups) || groups < 1 || groups > 30) {
    throw new HttpError(400, 'BAD_REQUEST', '組數必須是 1–30');
  }

  let config;
  try {
    config = makeConfig({
      totalWeeks: body.totalWeeks,
      pacing: body.pacing,
      manualShipping: body.manualShipping,
      demand: body.demand,
    });
  } catch (e) {
    throw new HttpError(400, 'BAD_CONFIG', e.message);
  }

  const cls = await insertWithUniqueCode('classes', { name, config }, 'join_code');

  const created = [];
  for (let groupNo = 1; groupNo <= groups; groupNo++) {
    const game = await insertWithUniqueCode(
      'games',
      { class_id: cls.id, group_no: groupNo },
      'code',
      'id, code',
    );
    check(
      await db().from('game_states').insert({
        game_id: game.id,
        state: createInitialState(config),
        current_week: 1,
      }),
    );
    created.push({ gameId: game.id, groupNo, code: game.code });
  }

  return {
    classId: cls.id,
    name: cls.name,
    joinCode: cls.join_code, // 給學生的班級代碼
    teacherToken: cls.teacher_token, // 老師進後台的唯一憑證，前端務必提醒老師存好
    config: { totalWeeks: config.totalWeeks, pacing: config.pacing, manualShipping: config.manualShipping },
    groups: created,
  };
});
