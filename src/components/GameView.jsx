import React, { useState } from 'react';
import './GameView.css';

export default function GameView({ currentUser, myRole, onExitGame }) {
  // 回合狀態：'decision' (決策輸入) | 'result' (結算結果)
  const [phase, setPhase] = useState('decision');
  const [currentWeek, setCurrentWeek] = useState(1);

  // 1. 核心存貨與欠貨
  const [inventory, setInventory] = useState(12); // 期初存貨
  const [backlog, setBacklog] = useState(0);      // 累積欠貨
  const [incomingOrder, setIncomingOrder] = useState(4); // 下游本期新訂單

  // 2. 物流在途管線
  const [pipeline, setPipeline] = useState({
    arrivedNow: 4,     // 本期已到貨
    arrivingNext: 4,   // 1 期後抵達
    arrivingInTwo: 4   // 2 期後抵達
  });

  // 3. 失分紀錄 (存貨每箱-1, 欠貨每箱-2)
  const [myTotalPenalty, setMyTotalPenalty] = useState(12 * -1);
  const [groupTotalPenalty, setGroupTotalPenalty] = useState((12 * -1) * 4);

  // 4. 雙欄位輸入狀態：向上游訂貨 + 給下游出貨
  const [orderInput, setOrderInput] = useState('');   // 向上游提出的要求
  const [shipInput, setShipInput] = useState('');     // 給下游的出貨數量
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // 5. 當期結算摘要與歷史紀錄
  const [lastSummary, setLastSummary] = useState(null);
  const [history, setHistory] = useState([
    {
      week: 1,
      incomingOrder: 4,
      arrivedShipment: 4,
      shippedOut: '-',
      inventory: 12,
      backlog: 0,
      placedOrder: '-',
      myPenalty: -12,
      groupPenalty: -48
    }
  ]);

  const roleNames = {
    retailer: { name: '零售商 (Retailer)', upstream: '批發商', downstream: '消費者' },
    wholesaler: { name: '批發商 (Wholesaler)', upstream: '分銷商', downstream: '零售商' },
    distributor: { name: '分銷商 (Distributor)', upstream: '製造廠', downstream: '批發商' },
    factory: { name: '製造廠 (Factory)', upstream: '生產排程', downstream: '分銷商' }
  };
  const roleInfo = roleNames[myRole] || { name: '未知角色', upstream: '上游', downstream: '下游' };

  // 可用存貨總量與下游總需求
  const availableStock = inventory + pipeline.arrivedNow;
  const totalDemand = incomingOrder + backlog;

  // 學生提交本期雙重決策（僅限制出貨量不可超過現有可用存貨）
  const handleSubmitDecision = (e) => {
    e.preventDefault();
    const placed = parseInt(orderInput, 10);
    const shipped = parseInt(shipInput, 10);

    if (isNaN(placed) || placed < 0) {
      alert('請輸入有效的「向上游訂購」數量（大於或等於 0）！');
      return;
    }
    if (isNaN(shipped) || shipped < 0) {
      alert('請輸入有效的「給下游出貨」數量（大於或等於 0）！');
      return;
    }
    if (shipped > availableStock) {
      alert(`出貨失敗！你目前可用總存貨只有 ${availableStock} 箱，無法出 ${shipped} 箱。`);
      return;
    }

    setHasSubmitted(true);
  };

  // 由教授端觸發跳轉至 Phase 2
  const triggerProfessorResolve = () => {
    const placed = parseInt(orderInput || '0', 10);
    const shippedQty = parseInt(shipInput || '0', 10);

    // 1. 物理結算：超過下游需求時欠貨直接歸 0
    const newInventory = availableStock - shippedQty;
    const newBacklog = Math.max(0, totalDemand - shippedQty);

    // 2. 失分結算 (存貨 -1, 欠貨 -2)
    const invPenalty = newInventory * -1;
    const delayPenalty = newBacklog * -2;
    const roundMyPenalty = invPenalty + delayPenalty;
    const nextMyTotal = myTotalPenalty + roundMyPenalty;

    const mockTeammatesPenalty = -25;
    const roundGroupPenalty = roundMyPenalty + mockTeammatesPenalty;
    const nextGroupTotal = groupTotalPenalty + roundGroupPenalty;

    // 3. 管線往前推進一期
    const nextPipeline = {
      arrivedNow: pipeline.arrivingNext,
      arrivingNext: pipeline.arrivingInTwo,
      arrivingInTwo: placed
    };

    const summary = {
      week: currentWeek,
      placedOrder: placed,
      arrivedShipment: pipeline.arrivedNow,
      totalDemand,
      shippedQty,
      newInventory,
      newBacklog,
      invPenalty,
      delayPenalty,
      roundMyPenalty,
      roundGroupPenalty,
      nextMyTotal,
      nextGroupTotal
    };

    setLastSummary(summary);
    setInventory(newInventory);
    setBacklog(newBacklog);
    setPipeline(nextPipeline);
    setMyTotalPenalty(nextMyTotal);
    setGroupTotalPenalty(nextGroupTotal);

    setHistory(prev => [
      {
        week: currentWeek,
        incomingOrder: totalDemand,
        arrivedShipment: pipeline.arrivedNow,
        shippedOut: shippedQty,
        inventory: newInventory,
        backlog: newBacklog,
        placedOrder: placed,
        myPenalty: roundMyPenalty,
        groupPenalty: roundGroupPenalty
      },
      ...prev
    ]);

    setPhase('result');
  };

  // 開啟下一期決策
  const handleProceedToNextWeek = () => {
    setCurrentWeek(prev => prev + 1);
    setOrderInput('');
    setShipInput('');
    setHasSubmitted(false);
    setPhase('decision');
  };

  return (
    <div className="game-container">
      {/* 頂部資訊列 */}
      <header className="game-header">
        <div>
          <h2>第 <span className="highlight">{currentWeek}</span> 期</h2>
          <span className="role-tag">你的角色：{roleInfo.name}</span>
        </div>
        <button className="exit-btn" onClick={onExitGame}>暫離大廳</button>
      </header>

      {/* 教授本機測試控制條 */}
      <div className="simulation-bar">
        <span>👨‍🏫 本地模擬控制條：</span>
        {phase === 'decision' ? (
          <button
            className="sim-btn"
            disabled={!hasSubmitted}
            onClick={triggerProfessorResolve}
          >
            {hasSubmitted ? '⚡ 教授點擊：全員結算並跳轉至結果頁' : '（請先在下方提交決策）'}
          </button>
        ) : (
          <button className="sim-btn" onClick={handleProceedToNextWeek}>
            ⚡ 教授點擊：開啟第 {currentWeek + 1} 期決策
          </button>
        )}
      </div>

      {/* ==================== Phase 1: 決策輸入頁面 ==================== */}
      {phase === 'decision' && (
        <div className="phase-card">
          <div className="phase-badge">Phase 1：決策輸入階段</div>

          <div className="status-banner-grid">
            <div className="status-box highlight-box">
              <span className="box-title">目前可用存貨總量</span>
              <strong className="box-value text-green">{availableStock} 箱</strong>
              <small>期初 {inventory} + 本期到貨 {pipeline.arrivedNow}</small>
            </div>
            <div className="status-box">
              <span className="box-title">下游 ({roleInfo.downstream}) 總需求</span>
              <strong className="box-value">{totalDemand} 箱</strong>
              <small>本期新單 {incomingOrder} + 累積欠貨 {backlog}</small>
            </div>
            <div className="status-box">
              <span className="box-title">未按時抵達欠貨 (Backlog)</span>
              <strong className={`box-value ${backlog > 0 ? 'text-red' : ''}`}>{backlog} 箱</strong>
              <small>未滿足部分每期每箱扣 2 分</small>
            </div>
          </div>

          <h4 className="section-subtitle">🚚 物流管線進度 (在途物資分期明細)</h4>
          <div className="pipeline-grid">
            <div className="pipe-card current-arrival">
              <span className="pipe-tag">本期已到貨 (期初入庫)</span>
              <strong className="pipe-qty">+{pipeline.arrivedNow} 箱</strong>
              <span className="pipe-desc">已併入上方「可用存貨總量」</span>
            </div>

            <div className="pipe-card">
              <span className="pipe-tag">1 期後抵達 (下期入庫)</span>
              <strong className="pipe-qty">{pipeline.arrivingNext} 箱</strong>
              <span className="pipe-desc">已在運輸途中，下週一抵達</span>
            </div>

            <div className="pipe-card">
              <span className="pipe-tag">2 期後抵達 (下下期入庫)</span>
              <strong className="pipe-qty">{pipeline.arrivingInTwo} 箱</strong>
              <span className="pipe-desc">剛由上游出貨，運輸中</span>
            </div>
          </div>

          {/* 雙欄位決策輸入區 */}
          <form className="order-form-panel" onSubmit={handleSubmitDecision}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              
              {/* 欄位 1：給下游的出貨量 */}
              <div>
                <label>
                  1. 決定給下游【{roleInfo.downstream}】的出貨量：
                  <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'normal', marginTop: '0.2rem' }}>
                    （可用存貨上限 {availableStock} 箱，下游當前需求 {totalDemand} 箱）
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={availableStock}
                  placeholder={`輸入出貨箱數 (上限 ${availableStock})`}
                  value={shipInput}
                  disabled={hasSubmitted}
                  onChange={(e) => setShipInput(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* 欄位 2：向上游提出的訂貨要求 */}
              <div>
                <label>
                  2. 向上游【{roleInfo.upstream}】提出的訂貨量：
                  <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'normal', marginTop: '0.2rem' }}>
                    （訂購後需 2 期前置時間才會送達）
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="輸入向上游訂購箱數"
                  value={orderInput}
                  disabled={hasSubmitted}
                  onChange={(e) => setOrderInput(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%' }}
              disabled={hasSubmitted || orderInput === '' || shipInput === ''}
            >
              {hasSubmitted ? '✓ 已送出本期決策' : '提交本期決策'}
            </button>

            {hasSubmitted && (
              <div className="waiting-indicator">
                <span className="spinner">⏳</span>
                <span>你的決策（出貨 {shipInput} 箱、訂貨 {orderInput} 箱）已送出！請等待教授推進...</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ==================== Phase 2: 本輪結算結果頁面 ==================== */}
      {phase === 'result' && lastSummary && (
        <div className="phase-card result-phase">
          <div className="phase-badge result-badge">Phase 2：第 {lastSummary.week} 期 結算報告</div>

          <div className="score-summary-grid">
            <div className="score-card">
              <span className="score-label">自己累計失分</span>
              <strong className="score-val text-amber">{lastSummary.nextMyTotal} 分</strong>
              <span className="score-diff">（本期變化：{lastSummary.roundMyPenalty} 分）</span>
            </div>
            <div className="score-card">
              <span className="score-label">所屬組別累計失分</span>
              <strong className="score-val text-red">{lastSummary.nextGroupTotal} 分</strong>
              <span className="score-diff">（本期全組變化：{lastSummary.roundGroupPenalty} 分）</span>
            </div>
          </div>

          <h4 className="section-subtitle">📦 本期進出貨結算明細</h4>
          <div className="result-details-grid">
            <div className="result-item">
              <span>客戶總需求 (本期+積欠)</span>
              <strong>{lastSummary.totalDemand} 箱</strong>
            </div>
            <div className="result-item">
              <span>本期實際出貨給下游</span>
              <strong className="text-green">{lastSummary.shippedQty} 箱</strong>
            </div>
            <div className="result-item">
              <span>期末剩餘存貨總量</span>
              <strong className="text-green">{lastSummary.newInventory} 箱</strong>
            </div>
            <div className="result-item">
              <span>延誤未按時抵達欠貨</span>
              <strong className={lastSummary.newBacklog > 0 ? 'text-red' : ''}>
                {lastSummary.newBacklog} 箱
              </strong>
            </div>
          </div>

          <div className="penalty-breakdown">
            <h4>🎯 本期失分來源分析</h4>
            <div className="breakdown-row">
              <span>期末存貨扣分 ({lastSummary.newInventory} 箱 × -1)：</span>
              <strong>{lastSummary.invPenalty} 分</strong>
            </div>
            <div className="breakdown-row">
              <span>延誤欠貨扣分 ({lastSummary.newBacklog} 箱 × -2)：</span>
              <strong>{lastSummary.delayPenalty} 分</strong>
            </div>
            <div className="breakdown-divider"></div>
            <div className="breakdown-row highlight-row">
              <span>自己本期失分總計：</span>
              <strong className="text-amber">{lastSummary.roundMyPenalty} 分</strong>
            </div>
          </div>

          <div className="waiting-next-prompt">
            <span>⌛ 請等待教授檢視全班進度並開啟下一期...</span>
          </div>
        </div>
      )}

      {/* 常駐歷史流水表 */}
      <div className="history-section">
        <h3>📊 歷史營運與失分流水帳</h3>
        <div className="table-responsive">
          <table className="history-table">
            <thead>
              <tr>
                <th>時期</th>
                <th>下游需求</th>
                <th>上游到貨</th>
                <th>給下游出貨</th>
                <th>期末存貨</th>
                <th>欠貨積欠</th>
                <th>向上游訂貨</th>
                <th>自己失分</th>
                <th>組別失分</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, idx) => (
                <tr key={idx}>
                  <td>第 {row.week} 期</td>
                  <td>{row.incomingOrder}</td>
                  <td>{row.arrivedShipment}</td>
                  <td className="text-green">{row.shippedOut}</td>
                  <td><strong>{row.inventory}</strong></td>
                  <td className={row.backlog > 0 ? 'text-red' : ''}>{row.backlog}</td>
                  <td className="highlight-cell">{row.placedOrder}</td>
                  <td className="text-amber">{row.myPenalty}</td>
                  <td className="text-red">{row.groupPenalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}