import { useState } from 'react';
import './LoginView.css';
import { api } from '../lib/api.js';

// 學生：暱稱 + 班級代碼
// 老師：開新班，或用教師代碼回到自己的班
export default function LoginView({ onStudentLogin, onTeacherLogin }) {
  const [mode, setMode] = useState('student'); // 'student' | 'create' | 'resume'
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // 學生
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  // 老師開班
  const [className, setClassName] = useState('');
  const [groups, setGroups] = useState('3');
  const [totalWeeks, setTotalWeeks] = useState('24');
  const [secret, setSecret] = useState('');
  // 老師回到班級
  const [teacherToken, setTeacherToken] = useState('');

  const switchMode = (m) => {
    setMode(m);
    setErrorMsg('');
  };

  const run = async (fn) => {
    setErrorMsg('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErrorMsg(e.message || '發生錯誤，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const handleStudent = (e) => {
    e.preventDefault();
    const name = nickname.trim();
    const code = joinCode.trim().toUpperCase();
    if (!name) return setErrorMsg('請輸入你的暱稱或學號！');
    if (!code) return setErrorMsg('請輸入老師給的班級代碼！');
    run(async () => {
      await api.getLobby(code); // 先確認班級存在，代碼錯了在這裡就提示
      onStudentLogin({ nickname: name, joinCode: code });
    });
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!className.trim()) return setErrorMsg('請輸入班級名稱！');
    run(async () => {
      const created = await api.createClass({
        name: className.trim(),
        groups: Number(groups),
        totalWeeks: Number(totalWeeks),
        ...(secret ? { secret } : {}),
      });
      onTeacherLogin({ teacherToken: created.teacherToken, created });
    });
  };

  const handleResume = (e) => {
    e.preventDefault();
    const token = teacherToken.trim();
    if (!token) return setErrorMsg('請貼上開班時拿到的教師代碼！');
    run(async () => {
      await api.getDashboard(token); // 確認代碼有效
      onTeacherLogin({ teacherToken: token });
    });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon">🍺</span>
          <h2>{mode === 'student' ? '登入啤酒遊戲' : '教師專區'}</h2>
          <p>{mode === 'student' ? '進入供應鏈沙盒實驗室' : '開設班級、掌控全班遊戲進程'}</p>
        </div>

        {mode !== 'student' && (
          <div className="mode-tabs">
            <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => switchMode('create')}>
              開新班級
            </button>
            <button type="button" className={mode === 'resume' ? 'active' : ''} onClick={() => switchMode('resume')}>
              回到我的班級
            </button>
          </div>
        )}

        {errorMsg && <div className="error-alert" style={{ marginBottom: '1rem' }}>{errorMsg}</div>}

        {mode === 'student' && (
          <form onSubmit={handleStudent} className="login-form">
            <div className="form-item">
              <label htmlFor="nickname">玩家暱稱 / 學號</label>
              <input
                id="nickname"
                type="text"
                placeholder="請輸入你的名字或學號"
                maxLength={20}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div className="form-item">
              <label htmlFor="joinCode">班級代碼</label>
              <input
                id="joinCode"
                type="text"
                placeholder="老師提供的 6 碼代碼"
                autoCapitalize="characters"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={{ letterSpacing: '0.2em' }}
              />
            </div>
            <button type="submit" className="btn-primary login-btn" disabled={busy}>
              {busy ? '確認中…' : '進入大廳'}
            </button>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="login-form">
            <div className="form-item">
              <label htmlFor="className">班級名稱</label>
              <input id="className" type="text" placeholder="例如：作業管理 115-1" maxLength={60}
                value={className} onChange={(e) => setClassName(e.target.value)} />
            </div>
            <div className="form-item">
              <label htmlFor="groups">組數</label>
              <input id="groups" type="number" min="1" max="30" value={groups} onChange={(e) => setGroups(e.target.value)} />
            </div>
            <div className="form-item">
              <label htmlFor="totalWeeks">總期數（學生看不到）</label>
              <input id="totalWeeks" type="number" min="1" max="100" value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value)} />
            </div>
            <div className="form-item">
              <label htmlFor="secret">開班密碼（沒有設定就留空）</label>
              <input id="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary login-btn" disabled={busy}>
              {busy ? '開班中…' : '建立班級'}
            </button>
          </form>
        )}

        {mode === 'resume' && (
          <form onSubmit={handleResume} className="login-form">
            <div className="form-item">
              <label htmlFor="teacherToken">教師代碼</label>
              <input id="teacherToken" type="text" placeholder="開班時拿到的一長串代碼"
                value={teacherToken} onChange={(e) => setTeacherToken(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary login-btn" disabled={busy}>
              {busy ? '確認中…' : '進入主控台'}
            </button>
          </form>
        )}

        <div className="login-switch">
          {mode === 'student' ? (
            <button type="button" onClick={() => switchMode('create')}>我是老師 →</button>
          ) : (
            <button type="button" onClick={() => switchMode('student')}>← 回到學生登入</button>
          )}
        </div>
      </div>
    </div>
  );
}
