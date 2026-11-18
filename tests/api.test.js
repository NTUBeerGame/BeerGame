// API 整合測試：真的執行每支 API handler + 真的 SQL（PGlite），不需要 Supabase 帳號。
// 執行：npm run test:api
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fakeSupabase } from './fake-supabase.js';
import { setDbForTesting } from '../api/_lib/supabase.js';

import createClass from '../api/class/create.js';
import lobby from '../api/class/lobby.js';
import join from '../api/game/join.js';
import leave from '../api/game/leave.js';
import getState from '../api/game/state.js';
import order from '../api/game/order.js';
import dashboard from '../api/teacher/dashboard.js';
import action from '../api/teacher/action.js';

let pg;

before(async () => {
  pg = new PGlite();
  // Supabase 內建的角色和 publication，本機要自己建
  await pg.exec('create role anon; create role authenticated; create role service_role; create publication supabase_realtime;');
  const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8')
    .replace('create extension if not exists pgcrypto;', '');
  await pg.exec(sql);
  setDbForTesting(fakeSupabase(pg));
});

/** 模擬 Vercel 的 req/res 呼叫一支 handler */
async function call(handler, { method = 'GET', token, body, query = {} } = {}) {
  const req = { method, body, query, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const fails = (r, status, code) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.equal(r.body.error.code, code);
};

test('老師控節奏（預設）：開班 → 大廳佔位 → 決策 → 結算 → 結果頁 → 下一期 → 結束', async () => {
  const cls = ok(await call(createClass, { method: 'POST', body: { name: '作業管理', groups: 2, totalWeeks: 3 } }));
  assert.equal(cls.groups.length, 2);
  assert.equal(cls.config.pacing, 'teacher');
  const T = cls.teacherToken;

  // 大廳
  let lb = ok(await call(lobby, { query: { code: cls.joinCode.toLowerCase() } }));
  assert.equal(lb.groups.length, 2);
  assert.deepEqual(lb.groups[0].seats, {});
  fails(await call(lobby, { query: { code: 'NOPE00' } }), 404, 'CLASS_NOT_FOUND');

  const g1 = lb.groups[0].gameId;
  const A = ok(await call(join, { method: 'POST', body: { gameId: g1, role: 'retailer', nickname: '小明' } }));
  let B = ok(await call(join, { method: 'POST', body: { gameId: g1, role: 'wholesaler', nickname: '小華' } }));
  fails(await call(join, { method: 'POST', body: { gameId: g1, role: 'retailer', nickname: 'X' } }), 409, 'ROLE_TAKEN');
  fails(await call(join, { method: 'POST', body: { gameId: 'not-a-uuid', nickname: 'X' } }), 404, 'GAME_NOT_FOUND');

  // 放棄位置再換一個角色
  ok(await call(leave, { method: 'POST', token: B.token }));
  fails(await call(getState, { token: B.token }), 401, 'UNAUTHORIZED');
  B = ok(await call(join, { method: 'POST', body: { gameId: g1, role: 'distributor', nickname: '小華' } }));
  lb = ok(await call(lobby, { query: { code: cls.joinCode } }));
  assert.deepEqual(lb.groups[0].seats, { retailer: '小明', distributor: '小華' });

  // 還沒開始不能下單
  fails(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 4, ship: 4 } }), 409, 'NOT_PLAYING');
  ok(await call(action, { method: 'POST', token: T, body: { action: 'start' } }));
  fails(await call(leave, { method: 'POST', token: A.token }), 409, 'GAME_STARTED');

  // 第 1 期決策畫面
  let s = ok(await call(getState, { token: A.token }));
  assert.equal(s.game.phase, 'decision');
  assert.equal(s.view.inventory, 16);
  assert.equal(s.view.maxShip, 4);
  assert.equal(s.mySubmission, null);

  // 出貨超過上限會被擋
  fails(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 5, ship: 9 } }), 400, 'INVALID_SHIPMENT');
  fails(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 5 } }), 400, 'INVALID_SHIPMENT');

  let o = ok(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 5, ship: 4 } }));
  assert.deepEqual(o.submittedRoles, ['retailer']);
  assert.equal(o.advanced, false); // 老師控節奏：送出不會自動結算
  ok(await call(order, { method: 'POST', token: B.token, body: { week: 1, order: 6, ship: 1 } }));

  s = ok(await call(getState, { token: A.token }));
  assert.deepEqual(s.mySubmission, { order: 5, ship: 4 });

  // 老師後台看得到本期決策
  let dash = ok(await call(dashboard, { token: T }));
  assert.equal(dash.groups[0].allSubmitted, true);
  assert.deepEqual(dash.groups[0].roles[2].pendingOrder, { order: 6, ship: 1 });
  assert.equal(dash.groups[1].allSubmitted, true); // 第二組沒人 = 全部自動

  // 結算
  let r = ok(await call(action, { method: 'POST', token: T, body: { action: 'resolve' } }));
  assert.deepEqual(r.resolved.sort(), [1, 2]);

  // 結果頁
  s = ok(await call(getState, { token: B.token }));
  assert.equal(s.game.phase, 'result');
  assert.equal(s.game.week, 2);
  assert.equal(s.lastResult.week, 1);
  assert.equal(s.lastResult.shipped, 1);
  assert.equal(s.lastResult.backlog, 3);
  assert.equal(s.lastResult.weekCost, 15 * 1 + 3 * 2);
  assert.equal(s.history.length, 1);
  assert.ok(s.history[0].groupWeekCost > s.lastResult.weekCost);
  fails(await call(order, { method: 'POST', token: A.token, body: { week: 2, order: 4, ship: 4 } }), 409, 'NOT_DECISION_PHASE');

  // 下一期；B 沒送出 → 一般結算會略過，強制結算會代下
  ok(await call(action, { method: 'POST', token: T, body: { action: 'nextWeek' } }));
  s = ok(await call(getState, { token: B.token }));
  assert.equal(s.game.phase, 'decision');
  assert.equal(s.view.totalDemand, 3 + s.view.incomingOrder); // 上期欠 3
  fails(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 4, ship: 4 } }), 409, 'WEEK_MISMATCH');
  ok(await call(order, { method: 'POST', token: A.token, body: { week: 2, order: 4, ship: 4 } }));
  r = ok(await call(action, { method: 'POST', token: T, body: { action: 'resolve' } }));
  assert.deepEqual(r.resolved, [2]);
  assert.deepEqual(r.notReady, [{ groupNo: 1, waitingFor: ['distributor'] }]);
  r = ok(await call(action, { method: 'POST', token: T, body: { action: 'resolve', gameId: g1, force: true } }));
  assert.deepEqual(r.resolved, [1]);
  const src = (await pg.query(`select order_source from round_records where game_id=$1 and week=2 and role='distributor'`, [g1])).rows[0];
  assert.equal(src.order_source, 'timeout');

  // 第 3 期（最後一期）
  ok(await call(action, { method: 'POST', token: T, body: { action: 'nextWeek' } }));
  ok(await call(action, { method: 'POST', token: T, body: { action: 'resolve', force: true } }));
  s = ok(await call(getState, { token: A.token }));
  assert.equal(s.game.status, 'finished');
  assert.equal(s.view.finished, true);
  assert.equal(s.history.length, 3);

  // CSV
  const csv = await call(dashboard, { token: T, query: { format: 'csv' } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.equal(csv.body.trim().split('\n').length, 1 + 2 * 3 * 4); // 標題 + 2 組 × 3 期 × 4 角色

  // 別班的老師不能操作這班
  const other = ok(await call(createClass, { method: 'POST', body: { name: '別班', groups: 1 } }));
  fails(await call(action, { method: 'POST', token: other.teacherToken, body: { action: 'resolve', gameId: g1 } }), 404, 'GAME_NOT_FOUND');
  fails(await call(dashboard, { token: '00000000-0000-0000-0000-000000000000' }), 401, 'UNAUTHORIZED');
});

test('自動節奏：全組送出就直接結算、直接進下一期決策', async () => {
  const cls = ok(await call(createClass, {
    method: 'POST',
    body: { name: '自學', groups: 1, totalWeeks: 2, pacing: 'auto', manualShipping: false },
  }));
  const A = ok(await call(join, { method: 'POST', body: { code: cls.groups[0].code, nickname: '我' } }));
  assert.equal(A.role, 'retailer'); // 沒指定角色 → 第一個空位
  ok(await call(action, { method: 'POST', token: cls.teacherToken, body: { action: 'start' } }));

  const o = ok(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 4 } })); // 不用給出貨
  assert.equal(o.advanced, true);
  const s = ok(await call(getState, { token: A.token }));
  assert.equal(s.game.week, 2);
  assert.equal(s.game.phase, 'decision');
  assert.equal(s.lastResult.shipped, 4);
});

test('開班參數檢查', async () => {
  fails(await call(createClass, { method: 'POST', body: { name: '', groups: 1 } }), 400, 'BAD_REQUEST');
  fails(await call(createClass, { method: 'POST', body: { name: 'x', groups: 0 } }), 400, 'BAD_REQUEST');
  fails(await call(createClass, { method: 'POST', body: { name: 'x', groups: 1, pacing: 'fast' } }), 400, 'BAD_CONFIG');
  const r = await call(createClass, { method: 'GET' });
  assert.equal(r.status, 405);
});

test('adapter：API 回傳轉成皓婷元件的欄位', async () => {
  const { toGameViewModel, toLobbyModel, toProfessorModel } = await import('../src/lib/adapters.js');
  const cls = ok(await call(createClass, { method: 'POST', body: { name: 'adapter', groups: 1, totalWeeks: 5 } }));
  const T = cls.teacherToken;
  const lb = ok(await call(lobby, { query: { code: cls.joinCode } }));
  const A = ok(await call(join, { method: 'POST', body: { gameId: lb.groups[0].gameId, role: 'retailer', nickname: '小明' } }));

  const lm = toLobbyModel(ok(await call(lobby, { query: { code: cls.joinCode } })), A);
  assert.deepEqual(lm.groups[0].slots, { retailer: '小明', wholesaler: null, distributor: null, factory: null });
  assert.equal(lm.myRole, 'retailer');

  ok(await call(action, { method: 'POST', token: T, body: { action: 'start' } }));
  let m = toGameViewModel(ok(await call(getState, { token: A.token })));
  assert.equal(m.currentWeek, 1);
  assert.equal(m.phase, 'decision');
  assert.equal(m.inventory, 12);
  assert.equal(m.availableStock, 16);
  assert.deepEqual(m.pipeline, { arrivedNow: 4, arrivingNext: 4, arrivingInTwo: null });
  assert.equal(m.leadTime, 4);
  assert.equal(m.myTotalPenalty, 0);
  assert.equal(m.lastSummary, null);

  ok(await call(order, { method: 'POST', token: A.token, body: { week: 1, order: 6, ship: 2 } }));
  let pm = toProfessorModel(ok(await call(dashboard, { token: T })));
  assert.equal(pm.globalPhase, 'decision');
  assert.equal(pm.allGroupsSubmitted, true);
  assert.equal(pm.groups[0].roleStatuses[0].orderPlaced, 6);
  assert.equal(pm.groups[0].roleStatuses[1].student, '（自動）');

  ok(await call(action, { method: 'POST', token: T, body: { action: 'resolve' } }));
  m = toGameViewModel(ok(await call(getState, { token: A.token })));
  assert.equal(m.phase, 'result');
  assert.equal(m.currentWeek, 1); // 結果頁顯示剛結算的第 1 期
  assert.equal(m.lastSummary.shippedQty, 2);
  assert.equal(m.lastSummary.newBacklog, 2);
  assert.equal(m.lastSummary.invPenalty, -14);
  assert.equal(m.lastSummary.delayPenalty, -4);
  assert.equal(m.lastSummary.roundMyPenalty, -18);
  assert.equal(m.lastSummary.nextGroupTotal, -(18 + 12 * 3));
  assert.equal(m.history[0].placedOrder, 6);

  pm = toProfessorModel(ok(await call(dashboard, { token: T })));
  assert.equal(pm.globalPhase, 'result');
  assert.equal(pm.currentWeek, 1);
  assert.equal(pm.groups[0].roleStatuses[0].myPenalty, -18);
  assert.equal(pm.groups[0].roleStatuses[0].backlog, 2);
  assert.equal(pm.groups[0].groupPenalty, -54);
});
