// GameView 用：拿狀態、自動即時更新、送出決策。
//
//   const { model, error, loading, submitting, submitDecision } = useGame(token);
//   model 的欄位和 GameView 原本的 state 同名（見 src/lib/adapters.js 的 toGameViewModel）
//   await submitDecision({ order: 8, ship: 4 })
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { subscribeGame } from '../lib/realtime.js';
import { toGameViewModel } from '../lib/adapters.js';

export function useGame(token) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inflight = useRef(null);

  const refresh = useCallback(() => {
    if (!token) return Promise.resolve();
    // 短時間收到多個通知時合併成一次請求
    inflight.current ??= api
      .getState(token)
      .then((s) => {
        setRaw(s);
        setError(null);
      })
      .catch(setError)
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const gameId = raw?.game.id;
  useEffect(() => {
    if (!gameId) return;
    return subscribeGame(gameId, () => refresh());
  }, [gameId, refresh]);

  const submitDecision = useCallback(
    async ({ order, ship }) => {
      if (!raw) return;
      setSubmitting(true);
      try {
        await api.submitDecision(token, { week: raw.game.week, order, ship });
        await refresh();
      } catch (e) {
        if (e.code === 'WEEK_MISMATCH' || e.code === 'NOT_DECISION_PHASE') await refresh();
        throw e; // 讓畫面顯示 e.message（後端已經是中文）
      } finally {
        setSubmitting(false);
      }
    },
    [raw, token, refresh],
  );

  const model = useMemo(() => (raw ? toGameViewModel(raw) : null), [raw]);
  return { model, raw, error, loading: !raw && !error, submitting, submitDecision, refresh };
}
