// 自動下單策略。用途：
//   1. 沒有人坐的座位（單人模式時其他三個角色）
//   2. 玩家超時，老師按「強制下一回合」時代下
//   3. 測試與模擬長鞭效應
// 之後的 Player Agent 也是一個 (view) => number 的函式，可以直接替換這裡的策略。

import { advanceRound, createInitialState, getPlayerView } from './engine.js';
import { ROLES, MAX_ORDER } from './config.js';

const clampOrder = (x) => Math.min(MAX_ORDER, Math.max(0, Math.round(x)));

export const policies = {
  /** 收到多少就訂多少：最穩定，不會放大波動，適合當作預設代下策略 */
  passThrough: (view) => clampOrder(view.incomingOrder),

  /**
   * 錨定調整（Sterman 1989 描述的典型人類行為）：
   * 以收到的需求為錨，再依「庫存缺口」補單，但忽略在途貨物 → 會產生長鞭效應。
   */
  anchorAdjust: (view, { target = 12, alpha = 0.5 } = {}) =>
    clampOrder(view.incomingOrder + alpha * (target - (view.inventory - view.totalDemand))),
};
// 註：view.inventory - view.totalDemand = 出完貨後的淨存貨（正 = 存貨、負 = 欠貨）

/** 預設的自動代下策略 */
export const autoOrder = policies.passThrough;

/**
 * 用指定策略跑完整局（測試、Analyst、老師預覽不同需求時用）。
 * @param {import('./config.js').GameConfig} config
 * @param {(view: object, role: string) => number} policy
 */
export function simulate(config, policy) {
  let state = createInitialState(config);
  const records = [];
  while (!state.finished) {
    const orders = Object.fromEntries(ROLES.map((role) => [role, policy(getPlayerView(state, role), role)]));
    const out = advanceRound(state, orders);
    state = out.state;
    records.push(...out.records);
  }
  return { state, records };
}
