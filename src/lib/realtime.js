// 即時同步：訂閱 games 表的變動。
// 設計原則：Realtime 只當「門鈴」，收到通知就重新呼叫 API 拿完整狀態。
// 這樣斷線重連時不會漏資料，學生也看不到別人的庫存（games 表沒有這些欄位）。
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

/**
 * 訂閱一局遊戲。onChange 會在「有變動」與「（重新）連線成功」時被呼叫。
 * @returns {() => void} 取消訂閱
 */
export function subscribeGame(gameId, onChange) {
  return subscribe(`game:${gameId}`, `id=eq.${gameId}`, onChange);
}

/** 老師後台：訂閱整個班所有組 */
export function subscribeClass(classId, onChange) {
  return subscribe(`class:${classId}`, `class_id=eq.${classId}`, onChange);
}

function subscribe(name, filter, onChange) {
  if (!supabase) {
    console.warn('沒有設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，即時同步停用');
    return () => {};
  }
  const channel = supabase
    .channel(name)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter }, (payload) =>
      onChange(payload.new),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange(null); // 連上（含重連）就補抓一次
    });

  // 手機切回分頁時也補抓一次（背景分頁的 WebSocket 常被系統斷掉）
  const onVisible = () => document.visibilityState === 'visible' && onChange(null);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    supabase.removeChannel(channel);
  };
}
