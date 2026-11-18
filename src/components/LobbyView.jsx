import React, { useState } from 'react';
import './LobbyView.css';

const ROLES = [
  { id: 'retailer', name: '零售商 (Retailer)', icon: '🏪', desc: '直接面對終端消費者' },
  { id: 'wholesaler', name: '批發商 (Wholesaler)', icon: '📦', desc: '為零售商提供庫存' },
  { id: 'distributor', name: '分銷商 (Distributor)', icon: '🚚', desc: '調度區域物流與大宗物資' },
  { id: 'factory', name: '製造廠 (Factory)', icon: '🏭', desc: '釀造啤酒與產能排程' }
];

export default function LobbyView({ currentUser, onLogout, onStartGame }) {
  const [selectedGroup, setSelectedGroup] = useState('Group-A');
  const [slots, setSlots] = useState({
    retailer: null,
    wholesaler: null,
    distributor: null,
    factory: null
  });
  const [myRole, setMyRole] = useState(null);

  // 點擊佔位
  const handleClaimRole = (roleId) => {
    if (slots[roleId] !== null) return;

    setSlots((prev) => {
      const next = { ...prev };
      if (myRole) next[myRole] = null; // 釋放舊位置
      next[roleId] = currentUser.username;
      return next;
    });
    setMyRole(roleId);
  };

  // 放棄位置
  const handleLeaveRole = (e) => {
    e.stopPropagation();
    if (!myRole) return;
    setSlots((prev) => ({ ...prev, [myRole]: null }));
    setMyRole(null);
  };

  // 切換組別時重置狀態
  const handleGroupChange = (e) => {
    setSelectedGroup(e.target.value);
    setSlots({
      retailer: null,
      wholesaler: null,
      distributor: null,
      factory: null
    });
    setMyRole(null);
  };

  // 【本機測試專用】一鍵模擬另外 3 位隊友加入並佔位
  const handleFillMockTeammates = () => {
    if (!myRole) {
      alert('請你先點擊上方任一張角色卡片，選擇自己的位置！');
      return;
    }
    const mockNames = ['小明', '小華', '阿美'];
    let nameIdx = 0;

    setSlots((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((roleId) => {
        if (roleId !== myRole && next[roleId] === null) {
          next[roleId] = mockNames[nameIdx++];
        }
      });
      return next;
    });
  };

  const occupiedCount = Object.values(slots).filter(Boolean).length;
  const isReadyToStart = occupiedCount === 4 && myRole !== null;

  return (
    <div className="lobby-container">
      <div className="user-bar">
        <span>👤 目前登入：<strong>{currentUser.username}</strong></span>
        <button className="logout-btn" onClick={onLogout}>登出</button>
      </div>

      <header className="lobby-header">
        <h1>🍺 啤酒遊戲 - 房間組別與佔位</h1>
        <p>確認組別後，點擊下方供應鏈卡片以選擇您的角色</p>
      </header>

      <div className="group-selection">
        <label>當前組別：</label>
        <select value={selectedGroup} onChange={handleGroupChange}>
          <option value="Group-A">第一組 (Group A)</option>
          <option value="Group-B">第二組 (Group B)</option>
          <option value="Group-C">第三組 (Group C)</option>
        </select>
      </div>

      <div className="slots-grid">
        {ROLES.map((role) => {
          const occupant = slots[role.id];
          const isMine = myRole === role.id;
          const isOccupied = occupant !== null;

          let cardClass = 'role-card empty';
          if (isMine) cardClass = 'role-card mine';
          else if (isOccupied) cardClass = 'role-card occupied';

          return (
            <div
              key={role.id}
              className={cardClass}
              onClick={() => !isOccupied && handleClaimRole(role.id)}
            >
              <div className="role-icon">{role.icon}</div>
              <div className="role-title">{role.name}</div>
              <div className="role-desc">{role.desc}</div>
              <div className="role-status">
                {isMine ? `👤 ${occupant} (你)` : isOccupied ? `🔒 ${occupant}` : '+ 點擊佔位'}
              </div>
              {isMine && (
                <button className="leave-btn" onClick={handleLeaveRole}>
                  放棄此位置
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="lobby-footer">
        <div className="ready-text">
          目前組別就位狀況：<strong>{occupiedCount} / 4</strong>
        </div>

        {/* 本機測試快捷按鈕：未滿 4 人時顯示 */}
        {occupiedCount < 4 && (
          <button
            type="button"
            onClick={handleFillMockTeammates}
            style={{
              background: '#334155',
              color: '#e2e8f0',
              border: '1px dashed #64748b',
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            ⚡ 本機測試：模擬其他 3 位隊友加入
          </button>
        )}

        <button
          className="btn-primary"
          onClick={() => {
            if (!myRole) {
              alert('請先點擊上方任一張角色卡片選擇你的位置！');
              return;
            }
            onStartGame(myRole);
          }}
        >
          進入遊戲！ ({occupiedCount}/4 就位)
        </button>
      </div>
    </div>
  );
}