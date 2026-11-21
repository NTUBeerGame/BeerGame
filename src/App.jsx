import { useState } from 'react';
import './App.css';
import LoginView from './components/LoginView';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import ProfessorView from './components/ProfessorView';
import { studentStore, teacherStore } from './lib/api.js';

// 重新整理頁面時，從瀏覽器記住的資料回到上次的畫面
function initialView() {
  if (teacherStore.load()?.teacherToken) return 'professor';
  const s = studentStore.load();
  if (s?.seat?.token) return 'game';
  if (s?.joinCode && s?.nickname) return 'lobby';
  return 'login';
}

export default function App() {
  const [view, setView] = useState(initialView); // 'login' | 'lobby' | 'game' | 'professor'
  const [student, setStudent] = useState(() => studentStore.load());
  const [teacherToken, setTeacherToken] = useState(() => teacherStore.load()?.teacherToken ?? null);
  const [justCreated, setJustCreated] = useState(null); // 剛開班時顯示一次教師代碼

  const updateStudent = (next) => {
    setStudent(next);
    if (next) studentStore.save(next);
    else studentStore.clear();
  };

  // ── 學生 ──
  const handleStudentLogin = ({ nickname, joinCode }) => {
    const prev = studentStore.load();
    const sameClass = prev?.joinCode === joinCode && prev?.nickname === nickname;
    updateStudent({ nickname, joinCode, seat: sameClass ? prev.seat : null });
    setView(sameClass && prev?.seat ? 'game' : 'lobby');
  };

  const handleStudentLogout = () => {
    updateStudent(null);
    setView('login');
  };

  const handleStartGame = (seat) => {
    updateStudent({ ...studentStore.load(), seat });
    setView('game');
  };

  // 座位已經不存在（例如資料庫被清掉），回大廳重選
  const handleSeatLost = () => {
    updateStudent({ ...student, seat: null });
    setView('lobby');
  };

  // ── 老師 ──
  const handleTeacherLogin = ({ teacherToken: token, created }) => {
    teacherStore.save({ teacherToken: token });
    setTeacherToken(token);
    setJustCreated(created ?? null);
    setView('professor');
  };

  const handleTeacherLogout = () => {
    teacherStore.clear();
    setTeacherToken(null);
    setJustCreated(null);
    setView('login');
  };

  return (
    <main>
      {view === 'login' && (
        <LoginView onStudentLogin={handleStudentLogin} onTeacherLogin={handleTeacherLogin} />
      )}

      {view === 'lobby' && student && (
        <LobbyView
          nickname={student.nickname}
          joinCode={student.joinCode}
          onLogout={handleStudentLogout}
          onStartGame={handleStartGame}
        />
      )}

      {view === 'game' && student?.seat && (
        <GameView
          token={student.seat.token}
          onExitGame={() => setView('lobby')}
          onSeatLost={handleSeatLost}
        />
      )}

      {view === 'professor' && teacherToken && (
        <ProfessorView
          teacherToken={teacherToken}
          justCreated={justCreated}
          onLogout={handleTeacherLogout}
        />
      )}
    </main>
  );
}
