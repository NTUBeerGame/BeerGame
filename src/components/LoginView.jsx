import React, { useState } from 'react';
import './LoginView.css';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('請輸入玩家帳號/姓名！');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('請輸入密碼！');
      return;
    }

    // 前端模擬登入成功：把當前玩家名稱傳給外層
    setErrorMsg('');
    onLoginSuccess({ username });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon"></span>
          <h2>登入啤酒遊戲</h2>
          <p>進入供應鏈沙盒實驗室</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {errorMsg && <div className="error-alert">{errorMsg}</div>}

          <div className="form-item">
            <label>玩家帳號 / 暱稱</label>
            <input
              type="text"
              placeholder="請輸入你的名字或學號"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-item">
            <label>通行密碼</label>
            <input
              type="password"
              placeholder="輸入密碼 (本機測試隨意填)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary login-btn">
            登入系統
          </button>
        </form>
      </div>
    </div>
  );
}