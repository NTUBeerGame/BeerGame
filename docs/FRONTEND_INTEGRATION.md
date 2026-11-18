# 前端串接說明（給皓婷）

後端已經照妳的畫面流程做好了：玩家自己決定出貨、老師按鈕控制「結算 → 結果頁 → 開啟下一期」、存貨每箱 -1、欠貨每箱 -2。

妳只需要把元件裡的 mock state 換成三個 hook。hook 回傳的 `model` **欄位名稱和妳現在用的一樣**（轉換寫在 `src/lib/adapters.js`），所以 JSX 大部分不用動。

| 元件 | 用哪個 hook | 主要換掉的東西 |
| --- | --- | --- |
| `LobbyView` | `useLobby(joinCode, nickname)` | `slots`、`myRole`、組別下拉選單、模擬隊友按鈕 |
| `GameView` | `useGame(token)` | 所有遊戲數值的 `useState`、模擬控制條 |
| `ProfessorView` | `useProfessor(teacherToken)` | `roleStatuses`、`currentWeek`、`globalPhase`、組別分頁 |

## 1. 登入（`App.jsx`、`LoginView`）

後端**沒有帳號密碼**，學生用「暱稱 ＋ 班級代碼」進大廳，老師用「教師代碼」進後台。

- `LoginView` 的「通行密碼」欄位改成「班級代碼」。送出時傳 `{ nickname, joinCode }`。
- 刪掉 `prof` / `admin` 進教授頁的判斷（任何人都能打 prof）。改成加一個「我是老師」入口，兩個選項：
  - **開新班**：表單（班級名稱、組數、期數）→ `api.createClass(...)` → 畫面上**大大顯示** `joinCode`（給學生）和 `teacherToken`（老師要自己存好），並 `teacherStore.save({ teacherToken, classId, joinCode })`
  - **回到我的班**：輸入教師代碼
- App 啟動時先讀 `studentStore.load()` / `teacherStore.load()`，有就直接回到上次的畫面（重新整理不會掉線）。

## 2. 大廳（`LobbyView`）

```jsx
import { useLobby } from '../hooks/useLobby.js';
import { ROLE_INFO } from '../lib/adapters.js';

const { model, seat, error, claimRole, leaveRole } = useLobby(joinCode, nickname);
const group = model?.groups.find((g) => g.id === selectedGroupId) ?? model?.groups[0];
const slots = group?.slots;                       // 和原本一樣 { retailer: '小明' | null, ... }
const myRole = seat?.gameId === group?.id ? seat.role : null;
```

- 組別下拉：`model.groups.map(g => <option value={g.id}>{g.label}</option>)`
- 點卡片：`await claimRole(group.id, role.id)`（已經坐在別的位置會自動先放棄）。被別人搶走會丟 `ROLE_TAKEN`，顯示 `e.message`。
- 放棄此位置：`await leaveRole()`。老師按開始後就不能放棄了（`GAME_STARTED`）。
- 刪掉「模擬其他 3 位隊友」按鈕：**沒人坐的角色後端會自動代下**，不用湊滿 4 人。
- 其他人佔位會即時出現，不用重新整理。
- 「進入遊戲」：`onStartGame(seat)`，然後 GameView 用 `seat.token`。

## 3. 遊戲畫面（`GameView`）

```jsx
import { useGame } from '../hooks/useGame.js';

const { model, error, loading, submitting, submitDecision } = useGame(seat.token);
const [orderInput, setOrderInput] = useState('');   // 這兩個輸入框的 state 保留
const [shipInput, setShipInput] = useState('');
if (loading) return <p>載入中…</p>;

const { phase, currentWeek, inventory, backlog, incomingOrder, pipeline,
        availableStock, totalDemand, maxShip, hasSubmitted, lastSummary, history,
        myTotalPenalty, groupTotalPenalty, roleInfo, leadTime } = model;
```

- **刪掉**：`phase`、`currentWeek`、`inventory`…這些 `useState`，`triggerProfessorResolve`、`handleProceedToNextWeek`，整個 `simulation-bar`。切換頁面由老師控制，後端會即時推過來。
- 送出：
  ```js
  try { await submitDecision({ order: Number(orderInput), ship: Number(shipInput) }); }
  catch (e) { setErrorMsg(e.message); }   // 後端錯誤訊息已經是中文
  ```
- `hasSubmitted` 改用 `model.hasSubmitted`（重新整理也會保留）；已送出的數字是 `model.submittedOrder` / `model.submittedShip`。
- 進入下一期時要清空輸入框：`useEffect(() => { setOrderInput(''); setShipInput(''); }, [currentWeek, phase])`
- **出貨輸入框的上限改成 `maxShip`**（= min(可用存貨, 下游總需求)），不是 `availableStock`。超過下游需求出貨沒有意義，後端會擋。
- `pipeline.arrivingInTwo` 可能是 `null`：上游這期要出多少，要結算後才知道。顯示「結算後揭曉」。
- 訂貨說明「訂購後需 2 期前置時間」要改成 `` `訂購後約 ${leadTime} 期才會到貨` ``。訂單傳到上游要 2 期、上游出貨再運 2 期，總共 4 期。
- 新增三種狀態提示（看 `model.status`）：
  - `waiting`：「等待老師開始遊戲」
  - `paused`：「老師已暫停」
  - `finished`：顯示最終結果，不能再送出
- `lastSummary`、`history` 欄位和原本完全一樣，結果頁與流水帳的 JSX 不用改。

## 4. 教授主控台（`ProfessorView`）

```jsx
import { useProfessor } from '../hooks/useProfessor.js';

const { model, busy, start, resolve, nextWeek, downloadCsv } = useProfessor(teacherToken);
const group = model?.groups.find((g) => g.id === selectedGroupId) ?? model?.groups[0];
const roleStatuses = group?.roleStatuses;   // 和原本欄位一樣，多了 shipPlaced、invPenalty、delayPenalty
```

- 組別分頁：`model.groups.map(...)`，不要寫死 A/B/C。
- 上方 banner：
  - `model.status === 'waiting'` → 顯示班級代碼 `model.joinCode` 和「開始遊戲」按鈕 → `start()`
  - `model.globalPhase === 'decision'` → 「結算本期」按鈕：
    ```js
    const r = await resolve();
    if (r.notReady.length && confirm(`第 ${r.notReady.map(g => g.groupNo).join('、')} 組還有人沒送出，要用自動決策代替並結算嗎？`)) {
      await resolve({ force: true });
    }
    ```
  - `model.globalPhase === 'result'` → 「開啟第 N+1 期」→ `nextWeek()`
- 按鈕可以一直按（不用等全員就緒）；`model.allGroupsSubmitted` 可以拿來改按鈕文字。
- 刪掉「快速模擬全員提交」。
- 加一個「下載 CSV」按鈕 → `downloadCsv()`。
- `alert()` 建議換成畫面上的提示文字（alert 會卡住整個頁面）。

## 5. 環境變數

`.env.local` 要有 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，即時更新才會動。本機請用 `npx vercel dev` 跑（`npm run dev` 只有前端，`/api` 會 404）。

## 順帶一提

`src/index.css` 是 Vite 範本留下來的，`#root { width: 1126px; text-align: center; }` 和淺色主題變數可能會和 `App.css` 打架。如果版面怪怪的，可以先把 `main.jsx` 裡的 `import './index.css'` 拿掉試試。
