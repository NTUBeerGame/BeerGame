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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handleRoleSelect = (e) => {
    const roleId = e.target.value;
    if (busy) return;

    if (!roleId) {
      if (myRole && !started) {
        act(() => leaveRole());
      }
      return;
    }

    if (roleId === myRole) return;
    if (slots[roleId] !== null) return;
    act(() => claimRole(group.id, roleId));
  };

  const handleLogout = async () => {
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
        <span className="brand-logo">Beer Game</span>

        <div className="profile-menu-wrapper">
          <button
            type="button"
            className="profile-circle-btn"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="個人資訊選單"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </button>

          {menuOpen && (
            <div className="profile-dropdown">
              <div className="dropdown-info-row">
                <span className="dropdown-label">班級</span>
                <span className="dropdown-value">{model.className || joinCode}</span>
              </div>
              <div className="dropdown-info-row">
                <span className="dropdown-label">暱稱</span>
                <span className="dropdown-value">{nickname}</span>
              </div>
              <div className="dropdown-divider" />
              <button type="button" className="dropdown-logout-btn" onClick={handleLogout}>
                登出
              </button>
            </div>
          )}
        </div>
      </div>

      <header className="lobby-header">
        <h1>歡迎進入 Beer Game</h1>
      </header>

      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="group-selection">
        <div className="lobby-select-row">
          <label htmlFor="group-select">組別：</label>
          <select
            id="group-select"
            value={group.id}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            disabled={busy}
          >
            {model.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
                {g.status === 'playing' ? '・進行中' : g.status === 'finished' ? '・已結束' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="lobby-select-row">
          <label htmlFor="role-select">角色：</label>
          <select
            id="role-select"
            value={myRole || ''}
            onChange={handleRoleSelect}
            disabled={busy}
          >
            <option value="">請選擇角色</option>
            {ROLES.map((role) => {
              const occupant = slots[role.id];
              const isMine = myRole === role.id;
              const isOccupiedByOther = occupant !== null && !isMine;

              return (
                <option
                  key={role.id}
                  value={role.id}
                  disabled={isOccupiedByOther || (started && !isMine)}
                >
                  {role.name}
                  {isOccupiedByOther ? `（已被 ${occupant} 選擇）` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="lobby-footer">
        <button
          type="button"
          className="btn-primary"
          disabled={!seat || busy}
          onClick={() => onStartGame(seat)}
        >
          進入遊戲
        </button>
      </div>
    </div>
  );
}
