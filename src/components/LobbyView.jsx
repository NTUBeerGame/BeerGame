return (
    <div className="lobby-container">
      <div className="user-bar">
        <span className="brand-logo">Beer Game</span>

        <div className="profile-menu-wrapper">
          <button
            type="button"
            className="profile-circle-btn"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {nickname.charAt(0).toUpperCase()}
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
        <h1>{nickname}，歡迎進入 Beer Game</h1>
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
                {g.id === model.myGameId ? '（你在這組）' : ''}
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
                <option key={role.id} value={role.id} disabled={isOccupiedByOther}>
                  {role.name}
                  {isMine ? '（已選擇）' : isOccupiedByOther ? `（已被 ${occupant} 選擇）` : ''}
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
