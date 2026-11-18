// GET /api/teacher/dashboard            （Authorization: Bearer <教師代碼>）
// GET /api/teacher/dashboard?format=csv  下載全班所有期的紀錄
// 老師看得到每一組、每個角色的完整數據，包含本期還沒結算的決策。
import { route, bearerToken, check } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';
import { getClassByTeacherToken, toRecord } from '../_lib/game.js';
import { ROLES, chainCost, getPlayerView } from '../../src/engine/index.js';

export default route(['GET'], async (req, res) => {
  const cls = await getClassByTeacherToken(bearerToken(req));
  const sb = db();

  const games = check(
    await sb.from('games')
      .select('id, code, group_no, status, phase, current_week, submitted_roles')
      .eq('class_id', cls.id)
      .order('group_no'),
  );

  // 每組分開查，避免 Supabase 單次查詢 1000 筆的上限
  const groups = await Promise.all(
    games.map(async (g) => {
      const [gs, seats, records, pending] = await Promise.all([
        sb.from('game_states').select('state').eq('game_id', g.id).single().then(check),
        sb.from('seats').select('role, nickname, controller, last_seen_at').eq('game_id', g.id).then(check),
        sb.from('round_records').select('*').eq('game_id', g.id).order('week').then(check),
        sb.from('orders').select('role, quantity, ship_qty').eq('game_id', g.id)
          .eq('week', g.current_week).then(check),
      ]);
      const humanRoles = seats.filter((s) => s.controller === 'human').map((s) => s.role);
      return {
        gameId: g.id,
        groupNo: g.group_no,
        code: g.code,
        status: g.status,
        phase: g.phase,
        week: g.current_week,
        // 這組所有真人都送出了沒（老師判斷能不能按結算）
        allSubmitted: humanRoles.every((r) => g.submitted_roles.includes(r)),
        roles: ROLES.map((role) => {
          const seat = seats.find((s) => s.role === role);
          const p = pending.find((o) => o.role === role);
          return {
            role,
            nickname: seat?.nickname ?? null, // null = 沒人坐，會自動代下
            controller: seat?.controller ?? 'auto',
            lastSeenAt: seat?.last_seen_at ?? null,
            submitted: Boolean(p),
            pendingOrder: p ? { order: p.quantity, ship: p.ship_qty } : null,
            view: getPlayerView(gs.state, role), // 本期即時狀態
          };
        }),
        groupTotalCost: chainCost(gs.state),
        records: records.map(toRecord),
      };
    }),
  );

  if (req.query?.format === 'csv') {
    const cols = ['week', 'role', 'beginInventory', 'received', 'incomingOrder', 'totalDemand',
      'shipped', 'inventory', 'backlog', 'order', 'orderSource', 'weekCost', 'totalCost'];
    const lines = [['group', ...cols].join(',')];
    for (const g of groups) {
      for (const r of g.records) lines.push([g.groupNo, ...cols.map((k) => r[k])].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="beer-game-${cls.join_code}.csv"`);
    return res.status(200).send('﻿' + lines.join('\n')); // BOM 讓 Excel 正確顯示中文
  }

  return {
    class: {
      id: cls.id,
      name: cls.name,
      joinCode: cls.join_code,
      totalWeeks: cls.config.totalWeeks,
      pacing: cls.config.pacing,
      manualShipping: cls.config.manualShipping,
      demand: cls.config.demand,
      costs: { holding: cls.config.holdingCost, backlog: cls.config.backlogCost },
    },
    groups,
  };
});
