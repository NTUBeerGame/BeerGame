import { useEffect, useState } from 'react';
import './GameView.css';
import { useGame } from '../hooks/useGame.js';
import { MAX_ORDER } from '../engine/config.js';

export default function GameView({ token, onExitGame, onSeatLost }) {
  const { model, error, loading, submitting, submitDecision } = useGame(token);

  // 座位已不存在（token 失效）→ 回大廳重選
  useEffect(() => {
    if (error?.code === 'UNAUTHORIZED') onSeatLost?.();
  }, [error, onSeatLost]);

  if (loading) {
    return <div className="game-container"><p className="waiting-next-prompt">載入遊戲中…</p></div>;
  }
  if (!model) {
    return (
      <div className="game-container">
        <div className="error-banner">無法載入遊戲：{error?.message ?? '未知錯誤'}</div>
        <button className="exit-btn" onClick={onExitGame}>回大廳</button>
      </div>
    );
  }

  const { roleInfo, status, phase, currentWeek, lastSummary, history } = model;
  const finished = status === 'finished';

  return (
    <div className="game-container">
      {/* 頂部資訊列 */}
      <header className="game-header">
        <div>
          <h2>第 <span className="highlight">{currentWeek}</span> 期</h2>
          <span className="role-tag">第 {model.groupNo} 組・你的角色：{roleInfo.name}</span>
        </div>
        <button className="exit-btn" onClick={onExitGame}>暫離大廳</button>
      </header>

      {/* 遊戲狀態提示 */}
      {status === 'waiting' && <div className="info-banner">⏳ 等待老師開始遊戲…（開始後畫面會自動切換）</div>}
      {status === 'paused' && <div className="info-banner">⏸ 老師已暫停遊戲，請稍候</div>}
      {finished && <div className="info-banner success">🏁 遊戲結束！感謝參與，請等待老師帶領討論。</div>}
      {error && error.code !== 'UNAUTHORIZED' && <div className="error-banner">連線問題：{error.message}（會自動重試）</div>}

      {/* ==================== Phase 1: 決策輸入頁面 ==================== */}
      {status !== 'waiting' && !finished && phase === 'decision' && (
        <div className="phase-card">
          <div className="phase-badge">Phase 1：決策輸入階段</div>

          <div className="status-banner-grid">
            <div className="status-box highlight-box">
              <span className="box-title">目前可用存貨總量</span>
              <strong className="box-value text-green">{model.availableStock} 箱</strong>
              <small>期初 {model.inventory} + 本期到貨 {model.pipeline.arrivedNow}</small>
            </div>
            <div className="status-box">
              <span className="box-title">下游 ({roleInfo.downstream}) 總需求</span>
              <strong className="box-value">{model.totalDemand} 箱</strong>
              <small>本期新單 {model.incomingOrder} + 累積欠貨 {model.backlog}</small>
            </div>
            <div className="status-box">
              <span className="box-title">未按時抵達欠貨 (Backlog)</span>
              <strong className={`box-value ${model.backlog > 0 ? 'text-red' : ''}`}>{model.backlog} 箱</strong>
              <small>未滿足部分每期每箱扣 {model.backlogCost} 分</small>
            </div>
          </div>

          <h4 className="section-subtitle">🚚 物流管線進度 (在途物資分期明細)</h4>
          <div className="pipeline-grid">
            <div className="pipe-card current-arrival">
              <span className="pipe-tag">本期已到貨 (期初入庫)</span>
              <strong className="pipe-qty">+{model.pipeline.arrivedNow} 箱</strong>
              <span className="pipe-desc">已併入上方「可用存貨總量」</span>
            </div>
            <div className="pipe-card">
              <span className="pipe-tag">1 期後抵達 (下期入庫)</span>
              <strong className="pipe-qty">{model.pipeline.arrivingNext} 箱</strong>
              <span className="pipe-desc">已在運輸途中，下期抵達</span>
            </div>
            <div className="pipe-card">
              <span className="pipe-tag">2 期後抵達 (下下期入庫)</span>
              <strong className="pipe-qty">
                {model.pipeline.arrivingInTwo === null ? '結算後揭曉' : `${model.pipeline.arrivingInTwo} 箱`}
              </strong>
              <span className="pipe-desc">
                {model.pipeline.arrivingInTwo === null ? `由上游（${roleInfo.upstream}）本期決定出貨量` : '已開始生產，運輸中'}
              </span>
            </div>
          </div>

          {/* key 換期數就重建表單 → 輸入框自動清空 */}
          <DecisionForm
            key={`${currentWeek}-${phase}`}
            model={model}
            paused={status === 'paused'}
            submitting={submitting}
            onSubmit={submitDecision}
          />
        </div>
      )}

      {/* ==================== Phase 2: 本期結算結果頁面 ==================== */}
      {(phase === 'result' || finished) && lastSummary && (
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
              <strong className={lastSummary.newBacklog > 0 ? 'text-red' : ''}>{lastSummary.newBacklog} 箱</strong>
            </div>
          </div>

          <div className="penalty-breakdown">
            <h4>🎯 本期失分來源分析</h4>
            <div className="breakdown-row">
              <span>期末存貨扣分 ({lastSummary.newInventory} 箱 × -{model.holdingCost})：</span>
              <strong>{lastSummary.invPenalty} 分</strong>
            </div>
            <div className="breakdown-row">
              <span>延誤欠貨扣分 ({lastSummary.newBacklog} 箱 × -{model.backlogCost})：</span>
              <strong>{lastSummary.delayPenalty} 分</strong>
            </div>
            <div className="breakdown-divider"></div>
            <div className="breakdown-row highlight-row">
              <span>自己本期失分總計：</span>
              <strong className="text-amber">{lastSummary.roundMyPenalty} 分</strong>
            </div>
          </div>

          {!finished && (
            <div className="waiting-next-prompt">
              <span>⌛ 請等待老師檢視全班進度並開啟下一期...</span>
            </div>
          )}
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
              {history.length === 0 && (
                <tr><td colSpan={9}>還沒有紀錄，第 1 期結算後就會出現</td></tr>
              )}
              {history.map((row) => (
                <tr key={row.week}>
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

// 出貨＋訂貨的輸入表單。送出後鎖住，可按「修改」在老師結算前改。
function DecisionForm({ model, paused, submitting, onSubmit }) {
  const { roleInfo, manualShipping, maxShip, availableStock, totalDemand, leadTime } = model;
  const [orderInput, setOrderInput] = useState(model.submittedOrder ?? '');
  const [shipInput, setShipInput] = useState(model.submittedShip ?? '');
  const [editing, setEditing] = useState(!model.hasSubmitted);
  const [errorMsg, setErrorMsg] = useState('');

  const locked = !editing || paused || submitting;
  const canSubmit = orderInput !== '' && (!manualShipping || shipInput !== '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const order = Number(orderInput);
    const ship = Number(shipInput);
    if (!Number.isInteger(order) || order < 0 || order > MAX_ORDER) {
      return setErrorMsg(`請輸入有效的「向上游訂購」數量（0–${MAX_ORDER} 的整數）！`);
    }
    if (manualShipping && (!Number.isInteger(ship) || ship < 0 || ship > maxShip)) {
      return setErrorMsg(`出貨量必須是 0–${maxShip} 的整數（可用存貨 ${availableStock} 箱、下游需求 ${totalDemand} 箱）`);
    }
    setErrorMsg('');
    try {
      await onSubmit({ order, ship: manualShipping ? ship : undefined });
      setEditing(false);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <form className="order-form-panel" onSubmit={handleSubmit} noValidate>
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      <div className="decision-grid">
        {manualShipping && (
          <div>
            <label htmlFor="ship-input">
              1. 決定給下游【{roleInfo.downstream}】的出貨量：
              <span className="label-hint">（最多可出 {maxShip} 箱：可用存貨 {availableStock}、下游需求 {totalDemand}）</span>
            </label>
            <input
              id="ship-input"
              type="number"
              min="0"
              max={maxShip}
              placeholder={`輸入出貨箱數 (上限 ${maxShip})`}
              value={shipInput}
              disabled={locked}
              onChange={(e) => setShipInput(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div>
          <label htmlFor="order-input">
            {manualShipping ? '2. ' : ''}向上游【{roleInfo.upstream}】提出的訂貨量：
            <span className="label-hint">（訂單傳遞加上運輸，約 {leadTime} 期後才會到貨）</span>
          </label>
          <input
            id="order-input"
            type="number"
            min="0"
            max={MAX_ORDER}
            placeholder="輸入向上游訂購箱數"
            value={orderInput}
            disabled={locked}
            onChange={(e) => setOrderInput(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {editing ? (
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!canSubmit || paused || submitting}>
          {submitting ? '送出中…' : model.hasSubmitted ? '送出修改' : '提交本期決策'}
        </button>
      ) : (
        <>
          <button type="button" className="btn-primary" style={{ width: '100%' }} disabled>
            ✓ 已送出本期決策
          </button>
          <div className="waiting-indicator">
            <span className="spinner">⏳</span>
            <span>
              你的決策（{manualShipping ? `出貨 ${model.submittedShip} 箱、` : ''}訂貨 {model.submittedOrder} 箱）已送出！請等待老師結算…
            </span>
            {!paused && (
              <button type="button" className="link-btn" onClick={() => setEditing(true)}>
                修改
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
