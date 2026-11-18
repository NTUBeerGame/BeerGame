// 後端專用的 Supabase client（service role，可繞過 RLS）。
// 檔名以底線開頭的資料夾不會被 Vercel 當成 API 路由。
import { createClient } from '@supabase/supabase-js';

let client;

export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('缺少環境變數 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** 只給整合測試用：換成接本機資料庫的替身 */
export function setDbForTesting(fake) {
  client = fake;
}
