// 把後端資料轉成皓婷元件現在使用的欄位名稱與格式，讓元件改動降到最少。
// 失分沿用前端的呈現方式：負數。

export const ROLE_INFO = {
  retailer: { name: '零售商 (Retailer)', icon: '🏪', desc: '直接面對終端消費者', upstream: '批發商', downstream: '消費者' },
  wholesaler: { name: '批發商 (Wholesaler)', icon: '📦', desc: '為零售商提供庫存', upstream: '分銷商', downstream: '零售商' },
  distributor: { name: '分銷商 (Distributor)', icon: '🚚', desc: '調度區域物流與大宗物資', upstream: '製造廠', downstream: '批發商' },
  factory: { name: '製造廠 (Factory)', icon: '🏭', desc: '釀造啤酒與產能排程', upstream: '生產排程', downstream: '分銷商' },
};

const neg = (x) => (x ? -x : 0); // 避免顯示 -0

/**
 * 畫面上要顯示的期數：決策頁顯示「正在決策的那一期」，結果頁顯示「剛結算完的那一期」。
 * （後端結算後 week 已經 +1；遊戲結束時 week 停在最後一期，不會 +1）
 */
export function displayWeek(game) {
  if (game.status === 'finished') return game.week;
  return game.phase === 'result' ? game.week - 1 : game.week;
}

/** GET /api/game/state → GameView 用的資料 */
export function toGameViewModel(s) {
  const v = s.view;
  const rules = s.rules;
  const last = s.lastResult;

  const lastSummary = last && {
    week: last.week,
    placedOrder: last.order,
    arrivedShipment: last.received,
    totalDemand: last.totalDemand,
    shippedQty: last.shipped,
    newInventory: last.inventory,
    newBacklog: last.backlog,
    invPenalty: neg(last.inventory * rules.holdingCost),
    delayPenalty: neg(last.backlog * rules.backlogCost),
    roundMyPenalty: neg(last.weekCost),
    roundGroupPenalty: neg(last.groupWeekCost),
    nextMyTotal: neg(last.totalCost),
    nextGroupTotal: neg(last.groupTotalCost),
  };

  return {
    currentWeek: displayWeek(s.game),
    phase: s.game.status === 'finished' ? 'result' : s.game.phase, // 'decision' | 'result'
    status: s.game.status, // waiting | playing | paused | finished
    myRole: s.seat.role,
    roleInfo: ROLE_INFO[s.seat.role],
    groupNo: s.game.groupNo,

    // Phase 1 決策畫面
    inventory: v.beginInventory, // 期初存貨
    backlog: v.backlog,
    incomingOrder: v.incomingOrder,
    pipeline: {
      arrivedNow: v.received,
      arrivingNext: v.inTransit[0] ?? 0,
      arrivingInTwo: v.inTransit[1] ?? null, // null = 上游本期出貨量要結算後才知道
    },
    availableStock: v.inventory,
    totalDemand: v.totalDemand,
    maxShip: v.maxShip, // 出貨輸入框的 max 請用這個（不能超過下游需求）
    manualShipping: rules.manualShipping,
    leadTime: rules.leadTime,
    holdingCost: rules.holdingCost,
    backlogCost: rules.backlogCost,

    myTotalPenalty: neg(v.totalCost),
    groupTotalPenalty: neg(s.groupTotalCost),

    hasSubmitted: Boolean(s.mySubmission),
    submittedOrder: s.mySubmission?.order ?? null,
    submittedShip: s.mySubmission?.ship ?? null,
    teamSubmittedCount: s.game.submittedRoles.length,

    // Phase 2 結果頁
    lastSummary,

    // 歷史流水帳（新的在上面，和原本一樣）
    history: [...s.history].reverse().map((r) => ({
      week: r.week,
      incomingOrder: r.totalDemand,
      arrivedShipment: r.received,
      shippedOut: r.shipped,
      inventory: r.inventory,
      backlog: r.backlog,
      placedOrder: r.order,
      myPenalty: neg(r.weekCost),
      cumulativeMyPenalty: neg(r.totalCost),
      groupPenalty: neg(r.groupWeekCost),
      cumulativeGroupPenalty: neg(r.groupTotalCost),
    })),
  };
}

/** GET /api/class/lobby → LobbyView 用的資料 */
export function toLobbyModel(lobby, mySeat) {
  return {
    className: lobby.class.name,
    groups: lobby.groups.map((g) => ({
      id: g.gameId,
      label: `第 ${g.groupNo} 組`,
      status: g.status,
      // 和原本的 slots 一樣：{ retailer: '小明' | null, ... }
      slots: Object.fromEntries(Object.keys(ROLE_INFO).map((r) => [r, g.seats[r] ?? null])),
    })),
    myGameId: mySeat?.gameId ?? null,
    myRole: mySeat?.role ?? null,
  };
}

/** GET /api/teacher/dashboard → ProfessorView 用的資料 */
export function toProfessorModel(d) {
  const { holding, backlog: backlogCost } = d.class.costs;
  const groups = d.groups.map((g) => ({
    id: g.gameId,
    label: `第 ${g.groupNo} 組`,
    code: g.code,
    status: g.status,
    phase: g.phase,
    week: displayWeek(g),
    allSubmitted: g.allSubmitted,
    submittedCount: g.roles.filter((r) => r.submitted).length,
    humanCount: g.roles.filter((r) => r.controller === 'human').length,
    groupPenalty: neg(g.groupTotalCost),
    records: g.records, // 畫長鞭效應圖用：每期每角色的 order / inventory / backlog
    // 和原本的 roleStatuses 一樣的欄位
    roleStatuses: g.roles.map((r) => ({
      roleId: r.role,
      roleName: ROLE_INFO[r.role].name,
      student: r.nickname ?? '（電腦）',
      isAuto: r.controller !== 'human',
      submitted: r.submitted || r.controller !== 'human',
      orderPlaced: r.pendingOrder?.order ?? null,
      shipPlaced: r.pendingOrder?.ship ?? null,
      inventory: r.view.beginInventory, // = 上一期期末存貨
      backlog: r.view.backlog, // = 上一期期末欠貨
      invPenalty: neg(r.view.beginInventory * holding),
      delayPenalty: neg(r.view.backlog * backlogCost),
      myPenalty: neg(r.view.totalCost),
    })),
  }));

  const playing = groups.filter((g) => g.status === 'playing');
  return {
    className: d.class.name,
    joinCode: d.class.joinCode,
    totalWeeks: d.class.totalWeeks,
    pacing: d.class.pacing,
    manualShipping: d.class.manualShipping,
    holdingCost: holding,
    backlogCost,
    // 全班進程：有任何一組還在決策就算「決策中」
    globalPhase: playing.some((g) => g.phase === 'decision') ? 'decision' : 'result',
    currentWeek: Math.max(0, ...groups.map((g) => g.week)),
    status: groups.every((g) => g.status === 'finished')
      ? 'finished'
      : groups.some((g) => g.status === 'playing')
        ? 'playing'
        : groups.some((g) => g.status === 'paused')
          ? 'paused'
          : 'waiting',
    allGroupsSubmitted: playing.filter((g) => g.phase === 'decision').every((g) => g.allSubmitted),
    groups,
  };
}
