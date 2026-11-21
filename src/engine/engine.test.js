// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  makeConfig,
  makeStepDemand,
  createInitialState,
  advanceRound,
  getPlayerView,
  chainCost,
  policies,
  simulate,
} from './index.js';

const all = (q) => Object.fromEntries(ROLES.map((r) => [r, q]));
const flat = (weeks, d = 4) => Array(weeks).fill(d);

test('經典需求：前 4 期為 4，第 5 期起為 8', () => {
  assert.deepEqual(makeStepDemand({ weeks: 8 }), [4, 4, 4, 4, 8, 8, 8, 8]);
});

test('預設值對齊前端：存貨扣 1、欠貨扣 2、手動出貨、老師控節奏', () => {
  const c = makeConfig();
  assert.equal(c.holdingCost, 1);
  assert.equal(c.backlogCost, 2);
  assert.equal(c.manualShipping, true);
  assert.equal(c.pacing, 'teacher');
});

test('第 1 期決策畫面：期初 12 + 到貨 4 = 可用 16，下游需求 4', () => {
  const v = getPlayerView(createInitialState(makeConfig()), 'retailer');
  assert.equal(v.beginInventory, 12);
  assert.equal(v.received, 4);
  assert.equal(v.inventory, 16);
  assert.equal(v.totalDemand, 4);
  assert.equal(v.maxShip, 4);
  // 決策時只知道「下期到」的那一格；上游本期要出多少，要等結算後才知道
  assert.deepEqual(v.inTransit, [4]);
  // 工廠例外：生產單到了就開工，所以兩格都已知
  assert.deepEqual(getPlayerView(createInitialState(makeConfig()), 'factory').inTransit, [4, 4]);
});

test('穩態：需求固定 4、全部訂 4 出 4 → 期末存貨永遠 12、每期失分 12', () => {
  const config = makeConfig({ totalWeeks: 20, demand: flat(20) });
  let state = createInitialState(config);
  for (let w = 1; w <= 20; w++) {
    const out = advanceRound(state, all(4), all(4));
    for (const rec of out.records) {
      assert.equal(rec.inventory, 12);
      assert.equal(rec.backlog, 0);
      assert.equal(rec.weekCost, 12);
    }
    state = out.state;
  }
  assert.equal(state.finished, true);
  assert.equal(chainCost(state), 12 * 20 * 4);
});

test('沒給出貨量時自動出到最多（經典模式）', () => {
  const config = makeConfig({ totalWeeks: 3, manualShipping: false, demand: flat(3) });
  const out = advanceRound(createInitialState(config), all(4), all(0)); // 自動模式下忽略 shipments
  for (const rec of out.records) assert.equal(rec.shipped, 4);
});

test('手動出貨：少出的變欠貨，欠貨扣 2 分', () => {
  const state = createInitialState(makeConfig({ demand: flat(24) }));
  const out = advanceRound(state, all(4), { ...all(4), retailer: 1 });
  const r = out.records[0];
  assert.equal(r.shipped, 1);
  assert.equal(r.backlog, 3);
  assert.equal(r.inventory, 15);
  assert.equal(r.weekCost, 15 * 1 + 3 * 2);
  // 下一期零售商的下游總需求 = 欠貨 3 + 新單 4
  assert.equal(getPlayerView(out.state, 'retailer').totalDemand, 7);
});

test('出貨量不可超過 min(可用存貨, 下游總需求)', () => {
  const state = createInitialState(makeConfig());
  assert.throws(() => advanceRound(state, all(4), { ...all(4), retailer: 5 }), { code: 'INVALID_SHIPMENT' });
  assert.throws(() => advanceRound(state, all(4), { ...all(4), retailer: -1 }), { code: 'INVALID_SHIPMENT' });
});

test('延遲正確：工廠多訂的貨要 orderDelay + shipDelay 期後才到工廠', () => {
  let state = createInitialState(makeConfig({ totalWeeks: 10, demand: flat(10) }));
  state = advanceRound(state, { ...all(4), factory: 14 }).state;
  const received = [];
  for (let w = 2; w <= 6; w++) {
    received.push(state.roles[3].received);
    state = advanceRound(state, all(4)).state;
  }
  assert.deepEqual(received, [4, 4, 4, 14, 4]); // 第 1 期下的單在第 1+2+2 = 5 期到
});

test('上游少出貨，下游 shipDelay 期後到貨變少', () => {
  let state = createInitialState(makeConfig({ totalWeeks: 6, demand: flat(6) }));
  state = advanceRound(state, all(4), { ...all(4), wholesaler: 0 }).state; // 批發商第 1 期不出貨
  state = advanceRound(state, all(4)).state;
  assert.equal(state.roles[0].received, 0); // 零售商第 3 期收到 0
});

test('advanceRound 不會修改原本的 state', () => {
  const state = createInitialState(makeConfig());
  const snapshot = JSON.stringify(state);
  advanceRound(state, all(7), all(2));
  assert.equal(JSON.stringify(state), snapshot);
});

test('非法訂貨會被擋下', () => {
  const state = createInitialState(makeConfig());
  assert.throws(() => advanceRound(state, { ...all(4), retailer: -1 }), { code: 'INVALID_ORDER' });
  assert.throws(() => advanceRound(state, { ...all(4), retailer: 2.5 }), { code: 'INVALID_ORDER' });
  assert.throws(() => advanceRound(state, { retailer: 4 }), { code: 'INVALID_ORDER' });
});

test('遊戲在 totalWeeks 期後結束，之後不能再推進', () => {
  let state = createInitialState(makeConfig({ totalWeeks: 3 }));
  let count = 0;
  for (let i = 0; i < 3; i++) {
    const out = advanceRound(state, all(4));
    state = out.state;
    count += out.records.length;
    assert.equal(out.finished, i === 2);
  }
  assert.equal(count, 12);
  assert.throws(() => advanceRound(state, all(4)), { code: 'GAME_FINISHED' });
});

test('玩家視角不含總期數與需求序列', () => {
  const view = getPlayerView(createInitialState(makeConfig()), 'wholesaler');
  assert.equal('config' in view, false);
  assert.equal('totalWeeks' in view, false);
  assert.equal('demand' in view, false);
});

test('長鞭效應：用典型人類策略，越上游下單波動越大', () => {
  const { records } = simulate(makeConfig({ totalWeeks: 36 }), (v) => policies.anchorAdjust(v));
  const range = (role) => {
    const qs = records.filter((r) => r.role === role).map((r) => r.order);
    return Math.max(...qs) - Math.min(...qs);
  };
  const [r, w, d, f] = ROLES.map(range);
  assert.ok(f > r, `工廠波動 ${f} 應大於零售商 ${r}`);
  assert.ok(w >= r && d >= w && f >= d, `波動應逐級放大：${[r, w, d, f].join(' → ')}`);
});
