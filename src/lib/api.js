// 前端呼叫後端的唯一入口。元件裡請用 hooks（src/hooks），不要直接寫 fetch。

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message);
  return data;
}

export const api = {
  // ── 學生 ──
  getLobby: (joinCode) => request(`class/lobby?code=${encodeURIComponent(joinCode)}`),
  /** @param {{ gameId?: string, code?: string, nickname: string, role?: string }} p */
  join: (p) => request('game/join', { method: 'POST', body: p }),
  leave: (token) => request('game/leave', { method: 'POST', token }),
  getState: (token) => request('game/state', { token }),
  /** @param {{ week: number, order: number, ship?: number }} p */
  submitDecision: (token, p) => request('game/order', { method: 'POST', token, body: p }),

  // ── 老師 ──
  /** @param {{ name: string, groups: number, totalWeeks?: number, pacing?: 'teacher'|'auto', manualShipping?: boolean, secret?: string }} p */
  createClass: (p) => request('class/create', { method: 'POST', body: p }),
  getDashboard: (teacherToken) => request('teacher/dashboard', { token: teacherToken }),
  /**
   * @param {'start' | 'pause' | 'resolve' | 'nextWeek'} action
   * @param {{ gameId?: string, force?: boolean }} [opts]
   */
  teacherAction: (teacherToken, action, opts = {}) =>
    request('teacher/action', { method: 'POST', token: teacherToken, body: { action, ...opts } }),

  /** 下載全班 CSV */
  async downloadCsv(teacherToken) {
    const res = await fetch('/api/teacher/dashboard?format=csv', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'beer-game.csv' });
    a.click();
    URL.revokeObjectURL(url);
  },
};

// 存在 localStorage：重新整理或斷線重連後還是同一個座位／同一個班。
// 部分瀏覽器（無痕、內嵌 WebView）會擋 localStorage，所以包 try/catch。
function makeStore(key) {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* 存不了就只在這次分頁有效 */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** 學生：{ nickname, joinCode, seat: { token, gameId, classId, groupNo, role } | null } */
export const studentStore = makeStore('beer-game.student');
/** 老師：{ teacherToken, classId, joinCode } */
export const teacherStore = makeStore('beer-game.teacher');
