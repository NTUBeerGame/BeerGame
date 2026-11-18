# Beer Game 後端 API

前端請透過 hooks（`src/hooks/`）或 `src/lib/api.js` 呼叫，不要直接寫 fetch。串接方式見 `FRONTEND_INTEGRATION.md`。

錯誤格式統一為 `{ "error": { "code": "ROLE_TAKEN", "message": "這個角色已經有人了" } }`，`message` 可以直接顯示給使用者。

角色代號：`retailer` 零售商、`wholesaler` 批發商、`distributor` 分銷商、`factory` 製造廠。

## 流程（預設：老師控節奏）

```
老師開班 ─→ 學生用班級代碼進大廳、點角色佔位
老師「開始」─→ 第 1 期 decision：學生送出（出貨＋訂貨）
老師「結算」─→ phase = result：學生看結算報告
老師「開啟下一期」─→ 第 2 期 decision … 直到最後一期 → status = finished
```

- 沒人坐的角色一律自動代下（訂貨 = 收到的訂單量、出貨 = 能出多少出多少）。
- 老師結算時有人沒送出：預設略過那一組，`force: true` 時用自動決策代替（紀錄標記為 `timeout`）。
- 開班時 `pacing: 'auto'` 可以改成「全組送出就自動結算」，適合之後的單人模式。

## 設定（開班時決定，`src/engine/config.js`）

| 參數 | 預設 | 說明 |
| --- | --- | --- |
| `totalWeeks` | 24 | 總期數（學生看不到） |
| `pacing` | `'teacher'` | `'teacher'` 老師控節奏、`'auto'` 全組送出就結算 |
| `manualShipping` | `true` | `false` = 經典規則，出貨自動出到最多，學生只需訂貨 |
| `holdingCost` / `backlogCost` | 1 / 2 | 每箱每期失分 |
| `orderDelay` / `shipDelay` | 2 / 2 | 訂單傳遞、運輸各需幾期 |
| `demand` | 4,4,4,4,8,8… | 顧客需求序列 |

## 學生

| API | 說明 |
| --- | --- |
| `GET /api/class/lobby?code=班級代碼` | 列出各組與佔位暱稱 `seats: { retailer: '小明' }` |
| `POST /api/game/join` `{ gameId 或 code, nickname, role? }` | 佔位 → `{ token, gameId, classId, groupNo, role }` |
| `POST /api/game/leave`（token） | 放棄位置，只能在開始前 |
| `GET /api/game/state`（token） | 自己的畫面資料，見下方 |
| `POST /api/game/order`（token）`{ week, order, ship }` | 送出本期決策，結算前可重送 |

`GET /api/game/state` 主要欄位：

- `game`：`status`（waiting／playing／paused／finished）、`phase`（decision／result）、`week`、`submittedRoles`
- `view`：`beginInventory` 期初存貨、`received` 本期到貨、`inventory` 可用存貨、`backlog` 上期欠貨、`incomingOrder` 下游新訂單、`totalDemand`、`maxShip`、`inTransit`、`totalCost`
- `rules`：`holdingCost`、`backlogCost`、`manualShipping`、`leadTime`
- `mySubmission`：本期已送出的 `{ order, ship }` 或 `null`
- `lastResult`：上一期結算（結果頁用）
- `history`：自己每期紀錄＋`groupWeekCost`／`groupTotalCost`（整組加總，看不到隊友個別數據）

錯誤碼：`NOT_PLAYING`、`NOT_DECISION_PHASE`（已結算，等老師開下一期）、`WEEK_MISMATCH`（已進下一期）、`INVALID_ORDER`、`INVALID_SHIPMENT`、`ROLE_TAKEN`、`GAME_STARTED`

## 老師（header：`Authorization: Bearer <teacherToken>`）

| API | 說明 |
| --- | --- |
| `POST /api/class/create` `{ name, groups, totalWeeks?, pacing?, manualShipping?, secret? }` | 開班 → `{ joinCode, teacherToken, groups }`（不需 token） |
| `GET /api/teacher/dashboard` | 全班即時數據：每組 `phase`、`allSubmitted`、四個角色的 `pendingOrder`、`view`、`records` |
| `GET /api/teacher/dashboard?format=csv` | 下載全班紀錄 |
| `POST /api/teacher/action` `{ action, gameId?, force? }` | `start`／`pause`／`resolve`／`nextWeek`；不給 gameId = 全班 |

`resolve` 回傳 `{ resolved: [組號], notReady: [{ groupNo, waitingFor: [角色] }] }`。

## 本機開發

```bash
npm install
cp .env.example .env.local   # 填入 Supabase 的值
npm test                     # 引擎單元測試 + API 整合測試（不需 Supabase）
npx vercel dev               # 同時跑前端和 /api
```
