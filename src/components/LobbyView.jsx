import { useState } from 'react';
import './LobbyView.css';
import { useLobby } from '../hooks/useLobby.js';
import { ROLE_INFO } from '../lib/adapters.js';

const ROLES = Object.entries(ROLE_INFO).map(([id, info]) => ({ id, ...info }));

export default function LobbyView({ nickname, joinCode, onLogout, onStartGame }) {
  const { model, seat, error, loading, claimRole, leaveRole } = useLobby(joinCode, nickname);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="lobby-container"><p className="lobby-hint">載入大廳中…</p></div>;
  }
  if (!model) {
    return (
      <div className="lobby-container">
        <div className="error-banner">無法載入大廳：{error?.message ?? '未知錯誤'}</div>
        <button className="logout-btn" onClick={onLogout}>回到登入頁</button>
      </div>
    );
  }

  const group =
    model.groups.find((g) => g.id === (selectedGroupId ?? model.myGameId)) ?? model.groups[0];
  const slots = group.slots;
  const myRole = model.myGameId === group.id ? model.myRole : null;
  const occupiedCount = Object.values(slots).filter(Boolean).length;
  const started = group.status !== 'waiting';

  const act = async (fn) => {
    setActionError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClaimRole = (roleId) => {
    if (busy || slots[roleId] !== null) return;
    act(() => claimRole(group.id, roleId));
  };

  const handleLeaveRole = (e) => {
    e.stopPropagation();
    act(() => leaveRole());
  };

  const handleLogout = async () => {
    // 遊戲還沒開始就登出 → 順便把位置讓出來，別人才選得到
    const myGroup = model.groups.find((g) => g.id === model.myGameId);
    if (seat && myGroup?.status === 'waiting') {
      try {
        await leaveRole();
      } catch {
        /* 讓不出來也照樣登出 */
      }
    }
    onLogout();
  };

  return (
    <div className="lobby-container">
      <div className="user-bar">
        <span>👤 目前登入：<strong>{nickname}</strong>（班級 {joinCode}）</span>
        <button className="logout-btn" onClick={handleLogout}>登出</button>
      </div>

      <header className="lobby-header">
        <h1>🍺 {model.className}</h1>
        <p>選擇組別後，點擊下方供應鏈卡片以選擇您的角色</p>
      </header>

      <div className="group-selection">
        <label htmlFor="group-select">當前組別：</label>
        <select id="group-select" value={group.id} onChange={(e) => setSelectedGroupId(e.target.value)}>
          {model.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
              {g.id === model.myGameId ? '（你在這組）' : ''}
              {g.status === 'playing' ? '・進行中' : g.status === 'finished' ? '・已結束' : ''}
            </option>
          ))}
        </select>
      </div>

      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="slots-grid">
        {ROLES.map((role) => {
          const occupant = slots[role.id];
          const isMine = myRole === role.id;
          const isOccupied = occupant !== null;

          let cardClass = 'role-card empty';
          if (isMine) cardClass = 'role-card mine';
          else if (isOccupied) cardClass = 'role-card occupied';

          return (
            <div key={role.id} className={cardClass} onClick={() => !isOccupied && handleClaimRole(role.id)}>
              <div className="role-icon">{role.icon}</div>
              <div className="role-title">{role.name}</div>
              <div className="role-desc">{role.desc}</div>
              <div className="role-status">
                {isMine ? `👤 ${occupant} (你)` : isOccupied ? `🔒 ${occupant}` : '+ 點擊佔位'}
              </div>
              {isMine && !started && (
                <button className="leave-btn" onClick={handleLeaveRole} disabled={busy}>
                  放棄此位置
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="lobby-footer">
        <div className="ready-text">
          {group.label} 就位狀況：<strong>{occupiedCount} / 4</strong>
        </div>
        <p className="lobby-hint">沒有人選的角色會由電腦自動扮演，不用湊滿 4 人。</p>

        <button className="btn-primary" disabled={!seat || busy} onClick={() => onStartGame(seat)}>
          {seat
            ? `進入遊戲！（第 ${seat.groupNo} 組・${ROLE_INFO[seat.role].name}）`
            : '請先點擊上方卡片選擇角色'}
        </button>
      </div>
    </div>
  );
}
