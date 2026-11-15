import React, { useState } from 'react';
import './App.css';
import LoginView from './components/LoginView';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import ProfessorView from './components/ProfessorView';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [gameState, setGameState] = useState('login'); // 'login' | 'lobby' | 'game' | 'professor'

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData);
    // 帳號輸入 prof 或 admin 直接進入教授主控台
    if (userData.username.toLowerCase() === 'prof' || userData.username.toLowerCase() === 'admin') {
      setGameState('professor');
    } else {
      setGameState('lobby');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    setGameState('login');
  };

  const handleStartGame = (role) => {
    setCurrentRole(role);
    setGameState('game');
  };

  return (
    <main>
      {gameState === 'login' && (
        <LoginView onLoginSuccess={handleLoginSuccess} />
      )}

      {gameState === 'lobby' && (
        <LobbyView
          currentUser={currentUser}
          onLogout={handleLogout}
          onStartGame={handleStartGame}
        />
      )}

      {gameState === 'game' && (
        <GameView
          currentUser={currentUser}
          myRole={currentRole}
          onExitGame={() => setGameState('lobby')}
        />
      )}

      {gameState === 'professor' && (
        <ProfessorView onLogout={handleLogout} />
      )}
    </main>
  );
}
