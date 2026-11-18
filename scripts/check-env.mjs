// 檢查 .env.local 與 Supabase 連線是否正確。不需要開 vercel dev。
// 用法：在專案資料夾執行 node scripts/check-env.mjs
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const pass = (m) => console.log(`✓ ${m}`);
const fail = (m, hint) => {
  console.log(`✗ ${m}`);
  if (hint) console.log(`  → ${hint}`);
  process.exitCode = 1;
};

// ── 1. 讀檔 ──────────────────────────────────────────────
const files = ['.env.local', '.env'].filter((f) => existsSync(f));
if (existsSync('.env.local.txt') || existsSync('.env.txt')) {
  fail('發現 .env.local.txt 或 .env.txt', '記事本自動加了 .txt，請把檔名的 .txt 拿掉');
}
if (files.length === 0) {
  fail('找不到 .env.local', '請在專案最外層（和 package.json 同一層）建立 .env.local');
  process.exit(1);
}
pass(`找到 ${files.join('、')}`);

const env = {};
for (const f of files.reverse()) {
  // .env 先讀、.env.local 後讀（覆蓋）
  for (const line of readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

// ── 2. 檢查格式 ─────────────────────────────────────────
const mask = (v) => (v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : '(太短)');

/** 判斷金鑰是公開的還是秘密的 */
function keyKind(key) {
  if (key.startsWith('sb_publishable_')) return 'public';
  if (key.startsWith('sb_secret_')) return 'secret';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.role === 'anon') return 'public';
      if (payload.role === 'service_role') return 'secret';
    } catch {
      /* ignore */
    }
  }
  return 'unknown';
}

let ok = true;
for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
  const v = env[name];
  if (!v) {
    fail(`${name} 沒有填`, '填 Project URL，例如 https://abcd1234.supabase.co');
    ok = false;
  } else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v)) {
    fail(`${name} 格式不對：${v}`, '應該長得像 https://abcd1234.supabase.co（結尾不要有 / 或 /rest/v1）');
    ok = false;
  } else pass(`${name} = ${v}`);
}

const secret = env.SUPABASE_SERVICE_ROLE_KEY;
if (!secret) {
  fail('SUPABASE_SERVICE_ROLE_KEY 沒有填', '填 Supabase → Project Settings → API Keys 裡「秘密」那把（service_role 或 secret）');
  ok = false;
} else {
  const k = keyKind(secret);
  if (k === 'public') {
    fail(`SUPABASE_SERVICE_ROLE_KEY 填成公開金鑰了（${mask(secret)}）`, '這裡要填「秘密」那把：service_role 或 sb_secret_ 開頭');
    ok = false;
  } else if (k === 'unknown') {
    fail(`SUPABASE_SERVICE_ROLE_KEY 看不出是哪種金鑰（${mask(secret)}）`, '請重新從 Supabase 複製完整的金鑰，可能少複製到一段');
    ok = false;
  } else pass(`SUPABASE_SERVICE_ROLE_KEY 是秘密金鑰（${mask(secret)}）`);
}

const anon = env.VITE_SUPABASE_ANON_KEY;
if (!anon) {
  fail('VITE_SUPABASE_ANON_KEY 沒有填', '填「公開」那把（anon 或 sb_publishable_ 開頭）；沒填的話即時更新不會動');
} else if (keyKind(anon) === 'secret') {
  fail('VITE_SUPABASE_ANON_KEY 填成秘密金鑰了！', '這把會被打包進瀏覽器，絕對不能放秘密金鑰。請換成公開那把（anon / sb_publishable_）');
} else pass(`VITE_SUPABASE_ANON_KEY 是公開金鑰（${mask(anon)}）`);

if (env.SUPABASE_URL && env.VITE_SUPABASE_URL && env.SUPABASE_URL !== env.VITE_SUPABASE_URL) {
  fail('SUPABASE_URL 和 VITE_SUPABASE_URL 不一樣', '兩個應該填同一個 Project URL');
}

if (!ok) {
  console.log('\n請先修正上面的 ✗，存檔後再跑一次。');
  process.exit(1);
}

// ── 3. 實際連線 ─────────────────────────────────────────
console.log('\n連線到 Supabase…');
const sb = createClient(env.SUPABASE_URL, secret, { auth: { persistSession: false } });
const tables = ['classes', 'games', 'game_states', 'seats', 'orders', 'round_records'];
for (const t of tables) {
  const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (!error) {
    pass(`資料表 ${t} 讀得到`);
    continue;
  }
  const msg = `${error.code ?? ''} ${error.message ?? ''}`;
  if (/does not exist|PGRST205|42P01|schema cache/i.test(msg)) {
    fail(`找不到資料表 ${t}`, '請到 Supabase → SQL Editor 貼上 supabase/migrations/0001_init.sql 整份並執行');
  } else if (/Invalid API key|JWT|401/i.test(msg)) {
    fail('金鑰被 Supabase 拒絕', '金鑰和網址不是同一個專案，或金鑰複製不完整');
  } else if (/permission denied|42501/i.test(msg)) {
    fail(`沒有資料表 ${t} 的權限`, '建立專案時可能取消了「Automatically expose new tables」，請跟 Claude 拿補權限的 SQL');
  } else if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    fail('連不上 Supabase', '檢查 SUPABASE_URL 是否正確、網路是否正常');
  } else {
    fail(`讀取 ${t} 失敗：${msg}`);
  }
  process.exit(1); // 第一張失敗通常後面都一樣，不用再往下測
}

const { error: rpcErr } = await sb.rpc('advance_game', {
  p_game_id: '00000000-0000-0000-0000-000000000000',
  p_expected_version: -1,
  p_new_state: {},
  p_records: [],
  p_fills: [],
  p_next_week: 1,
  p_finished: false,
  p_phase: 'decision',
});
if (rpcErr) fail(`找不到結算用的資料庫函式（${rpcErr.message}）`, 'SQL 可能只執行了一部分，請重新執行整份 0001_init.sql');
else pass('資料庫函式 advance_game 可以呼叫');

if (!process.exitCode) console.log('\n🎉 設定都正確！如果 vercel dev 還是 500，把那個視窗的錯誤貼給 Claude。');
