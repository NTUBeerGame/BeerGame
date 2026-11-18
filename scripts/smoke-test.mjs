// 本機冒煙測試：確認「前端 → API → Supabase」整條路是通的。
// 用法：
//   1. 一個視窗跑 npx vercel dev
//   2. 另一個視窗在專案資料夾執行 node scripts/smoke-test.mjs
// 會建立一個名為「冒煙測試」的班，跑完 1 期。測完可以到 Supabase 刪掉，不刪也沒關係。

const base = process.argv[2] ?? 'http://localhost:3000/api';

async function call(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(`${base}/${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    console.error(`\n✗ 連不上 ${base}`);
    console.error('  → 另一個視窗的 npx vercel dev 有在跑嗎？網址是 localhost:3000 嗎？');
    console.error(`  （${e.cause?.code ?? e.message}）`);
    process.exit(1);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    console.error(`\n✗ ${method} /api/${path} 失敗（HTTP ${res.status}）`);
    console.error(' ', typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data));
    if (res.status === 500) {
      console.error('\n  → 伺服器錯誤：請看跑 vercel dev 那個視窗印出的紅字，常見原因：');
      console.error('    - .env.local 的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 沒填或填錯（改完要重開 vercel dev）');
      console.error('    - Supabase 還沒執行 supabase/migrations/0001_init.sql');
    }
    if (res.status === 404 && typeof data === 'string') {
      console.error('\n  → 找不到 API：確認是用 npx vercel dev 跑的（npm run dev 沒有 /api）');
    }
    process.exit(1);
  }
  return data;
}

const ok = (msg) => console.log(`✓ ${msg}`);

console.log(`測試對象：${base}\n`);

const cls = await call('POST', 'class/create', { body: { name: '冒煙測試', groups: 1, totalWeeks: 3 } });
ok(`開班成功：班級代碼 ${cls.joinCode}，第 1 組代碼 ${cls.groups[0].code}`);

const lobby = await call('GET', `class/lobby?code=${cls.joinCode}`);
ok(`大廳讀取成功：${lobby.groups.length} 組`);

const me = await call('POST', 'game/join', { body: { gameId: lobby.groups[0].gameId, role: 'retailer', nickname: '靈兒' } });
ok(`佔位成功：${me.role}`);

await call('POST', 'teacher/action', { token: cls.teacherToken, body: { action: 'start' } });
ok('老師按下開始');

let s = await call('GET', 'game/state', { token: me.token });
ok(`第 ${s.game.week} 期決策畫面：期初存貨 ${s.view.beginInventory} + 到貨 ${s.view.received} = 可用 ${s.view.inventory}，下游需求 ${s.view.totalDemand}`);

await call('POST', 'game/order', { token: me.token, body: { week: 1, order: 6, ship: 4 } });
ok('送出決策：出貨 4、訂貨 6');

const r = await call('POST', 'teacher/action', { token: cls.teacherToken, body: { action: 'resolve' } });
ok(`老師結算：第 ${r.resolved.join('、')} 組完成`);

s = await call('GET', 'game/state', { token: me.token });
const last = s.lastResult;
ok(`結果頁：第 ${last.week} 期 出貨 ${last.shipped}、期末存貨 ${last.inventory}、欠貨 ${last.backlog}、本期失分 ${last.weekCost}、整組失分 ${last.groupWeekCost}`);

const dash = await call('GET', 'teacher/dashboard', { token: cls.teacherToken });
ok(`教師後台讀取成功：第 1 組階段 = ${dash.groups[0].phase}`);

console.log('\n🎉 全部通過！前端 → API → Supabase 整條路是通的。');
console.log(`（可以到 Supabase 的 Table Editor 看 round_records，應該多了 4 筆）`);
