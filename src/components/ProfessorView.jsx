import React, { useState } from 'react';
import './ProfessorView.css';

export default function ProfessorView({ onLogout }) {
  const [currentWeek, setCurrentWeek] = useState(1);
  // 全域當前階段：'decision' (學生輸入中) | 'result' (學生檢視結果)
  const [globalPhase, setGlobalPhase] = useState('decision');
  const [selectedGroup, setSelectedGroup] = useState('Group-A');

  const [roleStatuses, setRoleStatuses] = useState([
    { roleId: 'retailer', roleName: '零售商 (Retailer)', student: '小明', submitted: true, orderPlaced: 5, inventory: 8, backlog: 0, myPenalty: -8 },
    { roleId: 'wholesaler', roleName: '批發商 (Wholesaler)', student: '小華', submitted: true, orderPlaced: 6, inventory: 14, backlog: 0, myPenalty: -14 },
    { roleId: 'distributor', roleName: '分銷商 (Distributor)', student: '阿美', submitted: false, orderPlaced: null, inventory: 0, backlog: 4, myPenalty: -8 },
    { roleId: 'factory', roleName: '製造廠 (Factory)', student: '大強', submitted: true, orderPlaced: 8, inventory: 20, backlog: 0, myPenalty: -20 },
  ]);

  const submittedCount = roleStatuses.filter(r => r.submitted).length;
  const isAllSubmitted = submittedCount === 4;
  const currentGroupPenalty = roleStatuses.reduce((acc, cur) => acc + cur.myPenalty, 0);

  // 教授觸發全員結算 (Phase 1 -> Phase 2)
  const handleResolveRound = () => {
    setGlobalPhase('result');
    alert(`📢 已向全班發送指令：第 ${currentWeek} 期結算完成，學生端已跳轉至「結果報告頁」！`);
  };

  // 教授開啟下一期 (Phase 2 -> Phase 1)
  const handleStartNextWeek = () => {
    setCurrentWeek(prev => prev + 1);
    setGlobalPhase('decision');
    setRoleStatuses(prev => prev.map(r => ({ ...r, submitted: false, orderPlaced: null })));
    alert(`📢 已開啟第 ${currentWeek + 1} 期！學生端已切回「決策輸入頁面」。`);
  };

  // 模擬最後一位學生提交
  const handleSimulateLastStudent = () => {
    setRoleStatuses(prev => prev.map(r => ({ ...r, submitted: true, orderPlaced: r.orderPlaced || 4 })));
  };

  return (
    <div className="prof-container">
      <header className="prof-header">
        <div>
          <h2>🎓 啤酒遊戲 - 教授主控儀表板</h2>
          <p>掌控全班進程、監控全員提交狀態與供應鏈失分數據</p>
        </div>
        <button className="exit-btn" onClick={onLogout}>登出主控台</button>
      </header>

      <div className="prof-control-banner">
        <div className="banner-info">
          <div className="phase-pill">
            目前進程：<strong>第 {currentWeek} 期</strong>
            <span className={`status-badge ${globalPhase === 'decision' ? 'bg-amber' : 'bg-green'}`}>
              {globalPhase === 'decision' ? '階段 1：學生決策輸入中' : '階段 2：學生檢視結果報告'}
            </span>
          </div>
          <div className="submission-progress">
            當前組別提交進度：<strong>{submittedCount} / 4 人就緒</strong>
            {!isAllSubmitted && globalPhase === 'decision' && (
              <button className="quick-test-btn" onClick={handleSimulateLastStudent}>
                （點擊快速模擬全員提交）
              </button>
            )}
          </div>
        </div>

        <div className="banner-action">
          {globalPhase === 'decision' ? (
            <button
              className="btn-primary prof-big-btn"
              disabled={!isAllSubmitted}
              onClick={handleResolveRound}
            >
              {isAllSubmitted ? '⚡ 結算本期 ➜ 令學生跳轉結果頁' : `等待全員提交 (${submittedCount}/4)`}
            </button>
          ) : (
            <button
              className="btn-primary prof-big-btn"
              onClick={handleStartNextWeek}
            >
              🚀 開啟第 {currentWeek + 1} 期 ➜ 令學生進入輸入頁
            </button>
          )}
        </div>
      </div>

      <div className="prof-filter-row">
        <div className="group-tabs">
          <label>監控組別：</label>
          <button className={`tab-btn ${selectedGroup === 'Group-A' ? 'active' : ''}`} onClick={() => setSelectedGroup('Group-A')}>第一組 (Group A)</button>
          <button className={`tab-btn ${selectedGroup === 'Group-B' ? 'active' : ''}`} onClick={() => setSelectedGroup('Group-B')}>第二組 (Group B)</button>
          <button className={`tab-btn ${selectedGroup === 'Group-C' ? 'active' : ''}`} onClick={() => setSelectedGroup('Group-C')}>第三組 (Group C)</button>
        </div>
        <div className="group-total-badge">
          {selectedGroup} 累計失分：<strong className="text-red">{currentGroupPenalty} 分</strong>
        </div>
      </div>

      <div className="prof-card">
        <h3>📋 {selectedGroup} 供應鏈四節點即時數據</h3>
        <div className="table-responsive">
          <table className="prof-table">
            <thead>
              <tr>
                <th>角色節點</th>
                <th>學生暱稱</th>
                <th>本期提交狀態</th>
                <th>本期發出訂單</th>
                <th>目前存貨總量</th>
                <th>未按時抵達欠貨</th>
                <th>存貨失分 (每箱-1)</th>
                <th>延誤失分 (每箱-2)</th>
                <th>該節點累計失分</th>
              </tr>
            </thead>
            <tbody>
              {roleStatuses.map((item) => (
                <tr key={item.roleId}>
                  <td><strong>{item.roleName}</strong></td>
                  <td>{item.student}</td>
                  <td>
                    {item.submitted ? (
                      <span className="status-tag tag-ready">✓ 已送出</span>
                    ) : (
                      <span className="status-tag tag-waiting">⏳ 思考中...</span>
                    )}
                  </td>
                  <td className="highlight-cell">{item.orderPlaced !== null ? `${item.orderPlaced} 箱` : '-'}</td>
                  <td className="text-green"><strong>{item.inventory} 箱</strong></td>
                  <td className={item.backlog > 0 ? 'text-red' : ''}>{item.backlog} 箱</td>
                  <td className="text-amber">-{item.inventory} 分</td>
                  <td className="text-red">-{item.backlog * 2} 分</td>
                  <td className="text-total"><strong>{item.myPenalty} 分</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}