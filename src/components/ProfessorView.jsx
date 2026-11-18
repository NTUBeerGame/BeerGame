import { useState } from 'react';
import './ProfessorView.css';
import { useProfessor } from '../hooks/useProfessor.js';
import { ROLE_INFO } from '../lib/adapters.js';

export default function ProfessorView({ teacherToken, justCreated, onLogout }) {
  const { model, error, loading, busy, start, pause, resolve, nextWeek, downloadCsv } = useProfessor(teacherToken);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [notReady, setNotReady] = useState(null); // 結算時還有人沒送出的組
  const [message, setMessage] = useState('');
  const [showToken, setShowToken] = useState(Boolean(justCreated));

  if (loading) {
    return <div className="prof-container"><p className="submission-progress">載入主控台中…</p></div>;
  }
  if (!model) {
    return (
      <div className="prof-container">
        <div className="error-banner">無法載入主控台：{error?.message ?? '未知錯誤'}</div>
        <button className="exit-btn" onClick={onLogout}>回到登入頁</button>
      </div>
    );
  }

  const act = async (fn) => {
    setMessage('');
    try {
      return await fn();
    } catch (e) {
      setMessage(`❌ ${e.message}`);
      return null;
    }
  };

  const handleResolve = async (force = false) => {
    const r = await act(() => resolve(force ? { force: true } : undefined));
    if (!r) return;
    setNotReady(r.notReady?.length ? r.notReady : null);
    if (r.resolved.length) setMessage(`📢 已結算第 ${r.resolved.join('、')} 組，學生端已跳轉至結果報告頁`);
  };

  const handleNextWeek = async () => {
    setNotReady(null);
    const r = await act(() => nextWeek());
    if (r) setMessage(`📢 已開啟第 ${model.currentWeek + 1} 期，學生端已切回決策輸入頁`);
  };

  const { status, globalPhase, currentWeek } = model;
  const playingGroups = model.groups.filter((g) => g.status === 'playing');
  const readyCount = playingGroups.filter((g) => g.phase === 'decision' && g.allSubmitted).length;
  const decidingCount = playingGroups.filter((g) => g.phase === 'decision').length;

  const group = model.groups.find((g) => g.id === selectedGroupId) ?? model.groups[0];

  let badge;
  if (status === 'waiting') badge = <span className="status-badge bg-amber">等待開始</span>;
  else if (status === 'paused') badge = <span className="status-badge bg-amber">已暫停</span>;
  else if (status === 'finished') badge = <span className="status-badge bg-green">遊戲結束</span>;
  else if (globalPhase === 'decision') badge = <span className="status-badge bg-amber">階段 1：學生決策輸入中</span>;
  else badge = <span className="status-badge bg-green">階段 2：學生檢視結果報告</span>;

  return (
    <div className="prof-container">
      <header className="prof-header">
        <div>
          <h2>🎓 {model.className} - 教授主控儀表板</h2>
          <p>掌控全班進程、監控全員提交狀態與供應鏈失分數據</p>
        </div>
        <div className="prof-header-actions">
          <button className="exit-btn" onClick={() => setShowToken((v) => !v)}>
            {showToken ? '隱藏教師代碼' : '顯示教師代碼'}
          </button>
          <button className="exit-btn" onClick={onLogout}>登出主控台</button>
        </div>
      </header>

      {showToken && (
        <div className="info-banner">
          {justCreated && <strong>✅ 班級建立成功！</strong>}
          <div>
            🔑 教師代碼（之後在其他裝置進入主控台要用，<strong>請複製存好、不要給學生</strong>）：
          </div>
          <code className="token-code">{teacherToken}</code>
        </div>
      )}

      <div className="prof-control-banner">
        <div className="banner-info">
          <div className="join-code-line">
            學生班級代碼：<strong className="join-code">{model.joinCode}</strong>
          </div>
          <div className="phase-pill">
            目前進程：
            <strong>
              {status === 'waiting' ? '尚未開始' : `第 ${currentWeek} 期`}
              <span className="weeks-total"> / 共 {model.totalWeeks} 期</span>
            </strong>
            {badge}
          </div>
          {status === 'playing' && globalPhase === 'decision' && (
            <div className="submission-progress">
              全班提交進度：<strong>{readyCount} / {decidingCount} 組全員就緒</strong>
            </div>
          )}
        </div>

        <div className="banner-action">
          {status === 'waiting' && (
            <button className="btn-primary prof-big-btn" disabled={busy} onClick={() => act(() => start())}>
              🚀 開始遊戲
            </button>
          )}
          {status === 'paused' && (
            <button className="btn-primary prof-big-btn" disabled={busy} onClick={() => act(() => start())}>
              ▶ 繼續遊戲
            </button>
          )}
          {status === 'playing' && globalPhase === 'decision' && (
            <button className="btn-primary prof-big-btn" disabled={busy} onClick={() => handleResolve(false)}>
              {model.allGroupsSubmitted ? '⚡ 結算本期 ➜ 令學生跳轉結果頁' : `⚡ 結算本期（${readyCount}/${decidingCount} 組就緒）`}
            </button>
          )}
          {status === 'playing' && globalPhase === 'result' && (
            <button className="btn-primary prof-big-btn" disabled={busy} onClick={handleNextWeek}>
              🚀 開啟第 {currentWeek + 1} 期 ➜ 令學生進入輸入頁
            </button>
          )}
          <div className="secondary-actions">
            {status === 'playing' && (
              <button className="quick-test-btn" disabled={busy} onClick={() => act(() => pause())}>暫停遊戲</button>
            )}
            <button className="quick-test-btn" onClick={() => act(() => downloadCsv())}>下載 CSV</button>
          </div>
        </div>
      </div>

      {message && <div className="info-banner">{message}</div>}

      {notReady && (
        <div className="warn-banner">
          <div>
            以下組別還有人沒送出，這次沒有結算：
            {notReady.map((g) => (
              <div key={g.groupNo}>
                ・第 {g.groupNo} 組：{g.waitingFor.map((r) => ROLE_INFO[r].name).join('、')}
              </div>
            ))}
          </div>
          <button className="btn-primary" disabled={busy} onClick={() => handleResolve(true)}>
            強制結算（沒送出的由電腦代為決策）
          </button>
        </div>
      )}

      <div className="prof-filter-row">
        <div className="group-tabs">
          <label>監控組別：</label>
          {model.groups.map((g) => (
            <button
              key={g.id}
              className={`tab-btn ${g.id === group.id ? 'active' : ''}`}
              onClick={() => setSelectedGroupId(g.id)}
            >
              {g.label}
              {g.status === 'playing' && g.phase === 'decision' && (g.allSubmitted ? ' ✓' : ` ${g.submittedCount}/${g.humanCount}`)}
            </button>
          ))}
        </div>
        <div className="group-total-badge">
          {group.label} 累計失分：<strong className="text-red">{group.groupPenalty} 分</strong>
        </div>
      </div>

      <div className="prof-card">
        <h3>📋 {group.label}（小組代碼 {group.code}）供應鏈四節點即時數據</h3>
        <div className="table-responsive">
          <table className="prof-table">
            <thead>
              <tr>
                <th>角色節點</th>
                <th>學生暱稱</th>
                <th>本期提交狀態</th>
                {model.manualShipping && <th>本期出貨</th>}
                <th>本期發出訂單</th>
                <th>目前存貨總量</th>
                <th>未按時抵達欠貨</th>
                <th>存貨失分 (每箱-{model.holdingCost})</th>
                <th>延誤失分 (每箱-{model.backlogCost})</th>
                <th>該節點累計失分</th>
              </tr>
            </thead>
            <tbody>
              {group.roleStatuses.map((item) => (
                <tr key={item.roleId}>
                  <td><strong>{item.roleName}</strong></td>
                  <td>{item.student}</td>
                  <td>
                    {group.status !== 'playing' || group.phase !== 'decision' ? (
                      '-'
                    ) : item.isAuto ? (
                      <span className="status-tag tag-ready">🤖 電腦代理</span>
                    ) : item.submitted ? (
                      <span className="status-tag tag-ready">✓ 已送出</span>
                    ) : (
                      <span className="status-tag tag-waiting">⏳ 思考中...</span>
                    )}
                  </td>
                  {model.manualShipping && (
                    <td className="text-green">{item.shipPlaced !== null ? `${item.shipPlaced} 箱` : '-'}</td>
                  )}
                  <td className="highlight-cell">{item.orderPlaced !== null ? `${item.orderPlaced} 箱` : '-'}</td>
                  <td className="text-green"><strong>{item.inventory} 箱</strong></td>
                  <td className={item.backlog > 0 ? 'text-red' : ''}>{item.backlog} 箱</td>
                  <td className="text-amber">{item.invPenalty} 分</td>
                  <td className="text-red">{item.delayPenalty} 分</td>
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
