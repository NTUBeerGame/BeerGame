// LobbyView 用：列出組別與佔位狀況、即時看到別人佔位、佔位／放棄位置。
//
//   const { model, error, claimRole, leaveRole } = useLobby(joinCode, nickname);
//   model.groups[i].slots 和原本的 slots 一樣：{ retailer: '小明' | null, ... }
//   await claimRole(gameId, 'retailer')   // 已經坐在別的位置會先自動放棄
//   await leaveRole()
//   進入遊戲：用 studentStore.load().seat.token 給 GameView / useGame
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, studentStore } from '../lib/api.js';
import { subscribeClass } from '../lib/realtime.js';
import { toLobbyModel } from '../lib/adapters.js';

export function useLobby(joinCode, nickname) {
  const [lobby, setLobby] = useState(null);
  const [seat, setSeat] = useState(() => studentStore.load()?.seat ?? null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!joinCode) return Promise.resolve();
    return api
      .getLobby(joinCode)
      .then((l) => {
        setLobby(l);
        setError(null);
      })
      .catch(setError);
  }, [joinCode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const classId = lobby?.class.id;
  useEffect(() => {
    if (!classId) return;
    return subscribeClass(classId, () => refresh());
  }, [classId, refresh]);

  const saveSeat = useCallback(
    (next) => {
      setSeat(next);
      studentStore.save({ nickname, joinCode, seat: next });
    },
    [nickname, joinCode],
  );

  const leaveRole = useCallback(async () => {
    if (!seat) return;
    try {
      await api.leave(seat.token);
    } catch (e) {
      if (e.code !== 'UNAUTHORIZED') throw e; // 座位已經不存在 → 當作放棄成功
    }
    saveSeat(null);
    await refresh();
  }, [seat, saveSeat, refresh]);

  const claimRole = useCallback(
    async (gameId, role) => {
      if (seat?.gameId === gameId && seat?.role === role) return seat;
      if (seat) await leaveRole();
      try {
        const next = await api.join({ gameId, role, nickname });
        saveSeat(next);
        return next;
      } finally {
        await refresh();
      }
    },
    [seat, nickname, leaveRole, saveSeat, refresh],
  );

  const model = useMemo(() => (lobby ? toLobbyModel(lobby, seat) : null), [lobby, seat]);
  return { model, seat, error, loading: !lobby && !error, claimRole, leaveRole, refresh };
}
