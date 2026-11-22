import { useState } from 'react';
import './ClassAdminPanel.css';

// 教授主控台最下方的「班級管理」：結束遊戲、刪除班級資料。
// 兩個都是不能復原的操作，所以都要再確認一次。
export default function ClassAdminPanel({ joinCode, status, busy, onEnd, onDownloadCsv, onDelete }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const finished = status === 'finished';
  const canDelete = typed.trim().toUpperCase() === joinCode && !deleting;

  const handleEnd = async () => {
    setError('');
    try {
      await onEnd();
      setConfirmEnd(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    try {
      await onDelete(typed.trim().toUpperCase());
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <section className="admin-panel">
      <h3>⚙️ 班級管理</h3>
      {error && <div className="error-banner">{error}</div>}

      <div className="admin-row">
        <div>
          <strong>結束遊戲</strong>
          <p>全班立刻結束，學生不能再送出決策。資料都會保留，仍可下載 CSV。</p>
        </div>
        {finished ? (
          <span className="admin-done">✓ 遊戲已結束</span>
        ) : confirmEnd ? (
          <div className="admin-actions">
            <button className="admin-btn" onClick={() => setConfirmEnd(false)} disabled={busy}>取消</button>
            <button className="admin-btn warn" onClick={handleEnd} disabled={busy}>確定結束</button>
          </div>
        ) : (
          <button className="admin-btn warn" onClick={() => setConfirmEnd(true)} disabled={busy}>結束遊戲</button>
        )}
      </div>

      <div className="admin-row danger">
        <div>
          <strong>刪除班級所有資料</strong>
          <p>
            永久刪除所有組別、學生座位與每一期的紀錄，<b>無法復原</b>，教師代碼也會失效。
            如果需要研究資料，請先
            <button className="admin-link" onClick={onDownloadCsv}>下載 CSV</button>。
          </p>
          <label htmlFor="confirm-delete">輸入班級代碼 <code>{joinCode}</code> 確認刪除：</label>
          <input
            id="confirm-delete"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder={joinCode}
            autoComplete="off"
          />
        </div>
        <button className="admin-btn danger" onClick={handleDelete} disabled={!canDelete}>
          {deleting ? '刪除中…' : '永久刪除'}
        </button>
      </div>
    </section>
  );
}
