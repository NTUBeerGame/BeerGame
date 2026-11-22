// ProfessorView 用：全班即時數據 + 老師操作。
//
//   const { model, error, start, pause, resolve, nextWeek, downloadCsv } = useProfessor(teacherToken);
//   model.groups[i].roleStatuses 和原本的 roleStatuses 欄位一樣
//   const r = await resolve();            // 只結算全員都送出的組
//   if (r.notReady.length) await resolve({ force: true });  // 問過老師後強制結算
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { subscribeClass } from '../lib/realtime.js';
import { toProfessorModel } from '../lib/adapters.js';

export function useProfessor(teacherToken) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(null);

  const refresh = useCallback(() => {
    if (!teacherToken) return Promise.resolve();
    inflight.current ??= api
      .getDashboard(teacherToken)
      .then((d) => {
        setRaw(d);
        setError(null);
      })
      .catch(setError)
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [teacherToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const classId = raw?.class.id;
  useEffect(() => {
    if (!classId) return;
    return subscribeClass(classId, () => refresh());
  }, [classId, refresh]);

  const run = useCallback(
    async (action, opts) => {
      setBusy(true);
      try {
        const out = await api.teacherAction(teacherToken, action, opts);
        await refresh();
        return out;
      } finally {
        setBusy(false);
      }
    },
    [teacherToken, refresh],
  );

  const model = useMemo(() => (raw ? toProfessorModel(raw) : null), [raw]);
  return {
    model,
    raw,
    error,
    busy,
    loading: !raw && !error,
    refresh,
    start: (opts) => run('start', opts),
    pause: (opts) => run('pause', opts),
    resolve: (opts) => run('resolve', opts),
    nextWeek: (opts) => run('nextWeek', opts),
    end: () => run('end'),
    // 刪除後教師代碼就失效了，所以不再重新讀取主控台
    deleteClass: (joinCode) => api.teacherAction(teacherToken, 'deleteClass', { confirm: joinCode }),
    downloadCsv: () => api.downloadCsv(teacherToken),
  };
}
