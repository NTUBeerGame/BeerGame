// 遊戲參數。所有數字都集中在這裡，老師要改規則只動這個檔案。

/** 供應鏈由下游到上游的四個角色 */
export const ROLES = ['retailer', 'wholesaler', 'distributor', 'factory'];

export const ROLE_LABELS = {
  retailer: '零售商',
  wholesaler: '批發商',
  distributor: '經銷商',
  factory: '工廠',
};

/** 單次下單上限，防止誤輸入 99999 讓整局爆掉 */
export const MAX_ORDER = 999;

/**
 * 經典 Beer Game 需求：前 (stepWeek - 1) 週為 base，之後跳到 stepTo 並維持到最後。
 * 回傳長度為 weeks 的陣列，index 0 = 第 1 週。
 * 存成陣列（而不是函式）是為了之後讓 AI Agent 產生不同需求序列時也能直接替換。
 */
export function makeStepDemand({ base = 4, stepTo = 8, stepWeek = 5, weeks = 24 } = {}) {
  return Array.from({ length: weeks }, (_, i) => (i + 1 < stepWeek ? base : stepTo));
}

/**
 * 產生一份完整設定。沒給的欄位用預設值。
 *
 * 預設值對齊目前前端的設計：
 *   - 存貨每箱扣 1 分、欠貨每箱扣 2 分（經典版是 0.5 / 1，比例相同）
 *   - 玩家自己決定出貨量（manualShipping: true）；經典版是自動「能出多少出多少」
 *   - 老師控制每期節奏（pacing: 'teacher'）；'auto' = 全組下完單就自動進下一期
 *
 * @param {Partial<GameConfig>} overrides
 * @returns {GameConfig}
 */
export function makeConfig(overrides = {}) {
  const totalWeeks = overrides.totalWeeks ?? 24;
  const config = {
    totalWeeks,
    orderDelay: overrides.orderDelay ?? 2, // 訂單傳到上游需要幾週
    shipDelay: overrides.shipDelay ?? 2, // 貨物運到下游需要幾週
    initialInventory: overrides.initialInventory ?? 12,
    initialPipeline: overrides.initialPipeline ?? 4, // 開局時每格在途訂單／貨物的數量
    holdingCost: overrides.holdingCost ?? 1, // 每箱存貨每期失分
    backlogCost: overrides.backlogCost ?? 2, // 每箱欠貨每期失分
    manualShipping: overrides.manualShipping ?? true,
    pacing: overrides.pacing ?? 'teacher',
    demand: overrides.demand ?? makeStepDemand({ weeks: totalWeeks }),
  };
  validateConfig(config);
  return config;
}

function validateConfig(c) {
  const isNonNegInt = (x) => Number.isInteger(x) && x >= 0;
  if (!Number.isInteger(c.totalWeeks) || c.totalWeeks < 1 || c.totalWeeks > 100) {
    throw new Error('totalWeeks 必須是 1–100 的整數');
  }
  if (!Number.isInteger(c.orderDelay) || c.orderDelay < 1) throw new Error('orderDelay 必須 ≥ 1');
  if (!Number.isInteger(c.shipDelay) || c.shipDelay < 1) throw new Error('shipDelay 必須 ≥ 1');
  if (!isNonNegInt(c.initialInventory) || !isNonNegInt(c.initialPipeline)) {
    throw new Error('初始庫存與在途量必須是非負整數');
  }
  if (!(c.holdingCost >= 0) || !(c.backlogCost >= 0)) throw new Error('成本不可為負');
  if (typeof c.manualShipping !== 'boolean') throw new Error('manualShipping 必須是 true / false');
  if (!['teacher', 'auto'].includes(c.pacing)) throw new Error("pacing 必須是 'teacher' 或 'auto'");
  if (!Array.isArray(c.demand) || c.demand.length === 0 || !c.demand.every(isNonNegInt)) {
    throw new Error('demand 必須是非負整數陣列');
  }
}

/**
 * @typedef {Object} GameConfig
 * @property {number} totalWeeks
 * @property {number} orderDelay
 * @property {number} shipDelay
 * @property {number} initialInventory
 * @property {number} initialPipeline
 * @property {number} holdingCost
 * @property {number} backlogCost
 * @property {boolean} manualShipping
 * @property {'teacher' | 'auto'} pacing
 * @property {number[]} demand
 */
