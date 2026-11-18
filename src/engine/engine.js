// Beer Game 核心引擎：純函式，不碰資料庫、不碰網路。
// 前端、後端 API、之後的 Agent 都共用這一份，規則只寫一次。
//
// 一期的流程（四個角色同時進行）：
//   ── 期初（自動）──
//   1. 收貨：運輸管線最前面那格到貨，加進可用存貨
//   2. 收單：下游傳來的訂單到達（零售商收到的是顧客需求）
//   ── 決策（玩家）──
//   3. 出貨：manualShipping 時由玩家決定（上限 = min(可用存貨, 下游總需求)），否則自動出到最多
//   4. 下單：向上游訂貨，訂單進入往上游的訂單管線
//   ── 結算（advanceRound）──
//   5. 出貨送進下游的運輸管線；沒出的變成欠貨
//   6. 期末存貨 × holdingCost + 期末欠貨 × backlogCost = 本期失分
//
// 管線（queue）長度固定：每期從前面拿出一格、從後面放進一格。

import { ROLES, MAX_ORDER } from './config.js';

export class EngineError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
  }
}

/**
 * 建立一局新遊戲，並跑完第 1 期的收貨／收單，讓玩家可以開始做第 1 期的決策。
 * @param {import('./config.js').GameConfig} config
 */
export function createInitialState(config) {
  const fill = (len, v) => Array(len).fill(v);
  const state = {
    version: 2, // 狀態格式版本，日後改結構時用來遷移
    config,
    week: 1, // 目前「等待玩家決策」的期數
    finished: false,
    roles: ROLES.map(() => ({
      beginInventory: config.initialInventory, // 期初存貨（收貨前）
      received: 0, // 本期到貨
      inventory: config.initialInventory, // 可用存貨 = 期初 + 到貨（決策時）
      backlog: 0, // 上期留下的欠貨
      incomingOrder: 0, // 本期下游新訂單
      totalCost: 0, // 累計失分（到上一期為止）
      lastWeekCost: 0,
      lastOrder: config.initialPipeline,
      lastShipped: config.initialPipeline,
    })),
    // shipQueues[i]：正在運往角色 i 的貨，[0] 下期到
    shipQueues: ROLES.map(() => fill(config.shipDelay, config.initialPipeline)),
    // orderQueues[j]：正在傳往角色 j 的訂單（由角色 j-1 下的）。
    // j = 0 不用（零售商面對顧客需求）；j = 4 是工廠的生產單，送到無限產能的原料端。
    orderQueues: Array.from({ length: ROLES.length + 1 }, (_, j) =>
      j === 0 ? [] : fill(config.orderDelay, config.initialPipeline),
    ),
  };
  startWeek(state);
  return state;
}

/** 某期的顧客需求；超出設定長度時沿用最後一個值 */
export function demandAt(config, week) {
  const d = config.demand;
  return d[Math.min(week, d.length) - 1];
}

/** 期初：收貨、收單（會直接修改 s） */
function startWeek(s) {
  const n = ROLES.length;
  for (let i = 0; i < n; i++) {
    const r = s.roles[i];
    r.beginInventory = r.inventory;
    r.received = s.shipQueues[i].shift();
    r.inventory += r.received;
    r.incomingOrder = i === 0 ? demandAt(s.config, s.week) : s.orderQueues[i].shift();
  }
  // 原料端產能無限：工廠的生產單到了就全數投入生產（進入工廠的運輸管線）
  s.shipQueues[n - 1].push(s.orderQueues[n].shift());
}

/** 下游總需求 = 上期欠貨 + 本期新訂單 */
const totalDemandOf = (r) => r.backlog + r.incomingOrder;
/** 本期最多能出多少 */
const maxShipOf = (r) => Math.min(r.inventory, totalDemandOf(r));

function validateQty(value, code, label, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new EngineError(code, `${label}必須是 0–${max} 的整數`);
  }
  return value;
}

/**
 * 套用四個角色本期的決策，結算並推進到下一期。不會修改傳入的 state。
 * @param {object} state
 * @param {Record<string, number>} orders 每個角色向上游的訂貨量（必填）
 * @param {Record<string, number>} [shipments] 每個角色給下游的出貨量。
 *   沒給的角色（或 manualShipping 關閉時）自動出到最多。
 * @returns {{ state: object, records: object[], finished: boolean }}
 *   records：本期每個角色一筆完整紀錄，給資料庫存歷史、畫圖、Analyst 用
 */
export function advanceRound(state, orders, shipments = {}) {
  if (state.finished) throw new EngineError('GAME_FINISHED', '遊戲已結束');
  if (!orders || typeof orders !== 'object') throw new EngineError('INVALID_ORDER', '缺少訂單');

  const s = structuredClone(state);
  const n = ROLES.length;
  const qty = ROLES.map((role) => validateQty(orders[role], 'INVALID_ORDER', `${role} 的訂貨量`, MAX_ORDER));
  const ship = ROLES.map((role, i) => {
    const max = maxShipOf(s.roles[i]);
    const wanted = s.config.manualShipping ? shipments?.[role] : undefined;
    return wanted == null ? max : validateQty(wanted, 'INVALID_SHIPMENT', `${role} 的出貨量`, max);
  });

  const records = ROLES.map((role, i) => {
    const r = s.roles[i];
    const totalDemand = totalDemandOf(r);
    const endInventory = r.inventory - ship[i];
    const endBacklog = totalDemand - ship[i];
    const weekCost = endInventory * s.config.holdingCost + endBacklog * s.config.backlogCost;
    return {
      week: s.week,
      role,
      beginInventory: r.beginInventory,
      received: r.received,
      incomingOrder: r.incomingOrder,
      totalDemand,
      shipped: ship[i],
      inventory: endInventory,
      backlog: endBacklog,
      order: qty[i],
      weekCost,
      totalCost: r.totalCost + weekCost,
    };
  });

  // 結算：出貨送往下游、訂單送往上游、更新存貨與失分
  for (let i = 0; i < n; i++) {
    const r = s.roles[i];
    const rec = records[i];
    if (i > 0) s.shipQueues[i - 1].push(ship[i]); // 零售商出的貨給了顧客，不進管線
    s.orderQueues[i + 1].push(qty[i]);
    r.inventory = rec.inventory;
    r.backlog = rec.backlog;
    r.totalCost = rec.totalCost;
    r.lastWeekCost = rec.weekCost;
    r.lastOrder = qty[i];
    r.lastShipped = ship[i];
  }

  const finished = s.week >= s.config.totalWeeks;
  if (finished) {
    s.finished = true;
  } else {
    s.week += 1;
    startWeek(s);
  }
  return { state: s, records, finished };
}

/**
 * 玩家看得到的資訊。刻意不包含總期數與未來需求，避免玩家在最後幾期「清庫存」。
 */
export function getPlayerView(state, role) {
  const i = ROLES.indexOf(role);
  if (i < 0) throw new EngineError('INVALID_ROLE', `未知角色：${role}`);
  const r = state.roles[i];
  return {
    week: state.week,
    role,
    finished: state.finished,
    manualShipping: state.config.manualShipping,
    beginInventory: r.beginInventory,
    received: r.received,
    inventory: r.inventory, // 可用存貨（期初 + 本期到貨）
    backlog: r.backlog,
    incomingOrder: r.incomingOrder,
    totalDemand: totalDemandOf(r),
    maxShip: maxShipOf(r),
    totalCost: r.totalCost,
    lastWeekCost: r.lastWeekCost,
    lastOrder: r.lastOrder,
    lastShipped: r.lastShipped,
    // 正在運來給我的貨，[0] 下期到。上游本期的出貨要結算後才會加進來，
    // 所以決策時長度是 shipDelay - 1（工廠例外，生產單到了就開工）
    inTransit: [...state.shipQueues[i]],
    ordersInTransit: [...state.orderQueues[i + 1]], // 我已經下、還在路上的訂單
  };
}

/** 整條供應鏈（整組）的累計失分 */
export function chainCost(state) {
  return state.roles.reduce((sum, r) => sum + r.totalCost, 0);
}

/** 整組上一期的失分 */
export function chainLastWeekCost(state) {
  return state.roles.reduce((sum, r) => sum + r.lastWeekCost, 0);
}
