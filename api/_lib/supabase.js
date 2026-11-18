// 後端專用的 Supabase client（service role，可繞過 RLS）。
// 檔名以底線開頭的資料夾不會被 Vercel 當成 API 路由。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

let client;

/**
 * 本機開發時 vercel dev 不一定會把 .env.local 傳給 API，所以自己讀一次。
 * 線上（Vercel）不會有這些檔案（已被 .gitignore 排除），會直接用 Vercel 後台設定的環境變數。
 */
function loadLocalEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const file = join(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '').trim();
      if (value && !process.env[m[1]]) process.env[m[1]] = value; // 已經有的不覆蓋，.env.local 優先
    }
  }
}

export function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) loadLocalEnvFiles();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
      throw new Error(
        `缺少環境變數 ${missing.join('、')}。本機：請確認 ${join(process.cwd(), '.env.local')} 有這幾行；線上：請到 Vercel 專案 Settings → Environment Variables 設定`,
      );
    }
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** 只給整合測試用：換成接本機資料庫的替身 */
export function setDbForTesting(fake) {
  client = fake;
}
