## Context

目前的出缺勤系統已完成初版開發，具備 Docker 化運作環境、Postgres 資料庫、Nodemailer/Maildev 發信系統，以及基礎的打卡、請假、加班簽核流程。但在實際業務與安全性上有以下改善空間：
1. 前後端目錄完全分離，本地開發需手動進入兩目錄執行命令，缺乏統一的專案工作區（Monorepo Workspaces）管理。
2. 請假時數以純時間差計算，未扣除午休、六日及下班時間，且沒有防止同時間重疊請假的防呆機制。
3. 新增員工時發送臨時密碼，但沒有修改密碼的功能，且無法防範首登強制變更密碼的安全規範；管理員直接變更額度時亦無稽核日誌。
4. UI 介面為暗色系，在不同光源環境下閱讀不易，需支援亮暗色主題切換。

## Goals / Non-Goals

**Goals:**
- **Npm Workspaces 整合**：根目錄一鍵安裝與多模組同步啟動。
- **請假邏輯精準化**：
  - 排除週末（六日）及工作時間外時數，每滿一天扣除 1 小時午休（工作時段 09:00 - 18:00，午休 12:00 - 13:00）。
  - 後端資料庫交易（Transaction）檢查請假時間重疊防呆。
  - 前端請假起訖時間預設填入今日 `09:00` 與 `18:00`。
- **帳號安全性防護**：
  - 增加 `PUT /api/auth/password` 密碼修改介面與端點。
  - 首登強制變更密碼（若為臨時密碼，除了修改密碼與獲取使用者資訊 API 外，封鎖其他操作）。
  - 管理員手動調整額度時，在 `approval_logs` 寫入 `request_type = 'BALANCE'` 的稽核記錄。
- **雙主題切換 (Dark/Light)**：在 CSS 層抽離寫死的半透明背景與顏色，改用 CSS 變數，配合 localStorage 持久化。

**Non-Goals:**
- 不在此變更實作忘記密碼/信箱重設密碼機制。
- 亮暗色切換為手動點擊，不自動同步 OS / 瀏覽器系統主題。
- 不引入額外 monorepo 框架（如 Turborepo/Nx），使用 npm 內建 workspace 即可。

## Decisions

### Decision 1: 使用 Npm Workspaces 管理多模組專案
- **Rationale**: 我們的專案由前端與後端構成，使用 Npm Workspaces 可以統一根目錄依賴管理，並且可以透過根目錄的 `package.json` 同步啟動前後端，顯著提昇開發體驗。
- **Alternatives**: 保持現狀，前後端目錄各自獨立運作，需手動執行兩次安裝與啟動。

### Decision 2: 排除非工作時段的時數計算與時間重疊防呆
- **Rationale**: 
  - 時數計算：請假扣除額度應只算「工作時間（上班時間 - 下班時間 - 中午休息）」。在後端與前端同步實作工作時段計算法。
  - 重疊防呆：在 `POST /api/leaves` 時，後端將執行 SQL 查詢：
    `SELECT COUNT(*) FROM leave_requests WHERE user_id = $1 AND status != 'REJECTED' AND (start_time, end_time) OVERLAPS ($2, $3)`
    若大於 0 則阻擋。這能確保資料庫層級的資料一致性。
- **Alternatives**: 僅在前端阻擋重疊或時數計算，這無法防範直接向 API 送出的惡意/錯誤請求。

### Decision 3: 首次登入強制變更密碼工作流與額度修改軌跡紀錄
- **Rationale**: 
  - 使用者表新增 `must_change_password` 欄位（布林，預設 `true`）。
  - 新建的 Auth 中介軟體（Middleware）會攔截 `must_change_password === true` 的使用者請求（除了 `PUT /api/auth/password` 與 `GET /api/auth/me` 外，其餘回傳 `403 Forbidden` 與錯誤代碼 `PASSWORD_CHANGE_REQUIRED`），前端偵測到此代碼則強制彈出密碼修改視窗。
  - 管理員手動修改使用者額度（`PUT /api/users/:id`）時，將在同一個 DB Transaction 中寫入 `approval_logs`（`request_type = 'BALANCE'`, `action = 'APPROVE'`, `comment = '管理員手動調整額度...'`）。
- **Alternatives**: 僅新增修改密碼 API 但不強制變更，會留下臨時密碼外洩的安全隱憂。

### Decision 4: 使用 CSS 變數與 localStorage 實作手動主題切換
- **Rationale**: 將寫死的行內半透明顏色（如 `background: 'rgba(255,255,255,0.02)'`）改寫為 CSS 變數（如 `--bg-card`）。前端在最外層元件渲染主題 class（`.theme-light` / `.theme-dark`），並將使用者偏好儲存於 `localStorage.setItem('theme', ...)`。
- **Alternatives**: 使用 Tailwind CSS 主題架構。由於專案現行使用 Vanilla CSS，直接重構至 Tailwind 的成本過高，且不符合專案現行設計風格。

## Implementation Contract

### 系統行為 (Behavior)
1. **工作區管理**：根目錄執行 `npm install` 會將依賴安裝於根目錄，執行 `npm run dev` 將同時以 `vite` 與 `ts-node-dev` 啟動前後端。
2. **時數計算**：申請請假單時，輸入起訖時間後，前後端會精準顯示/儲存扣除非工作時段的時數。
3. **請假防重疊**：送出請假申請時，若與該帳號已存在的 PENDING_PROXY / PENDING_APPROVAL / APPROVED 假單時間重疊，系統退回 `400 Bad Request` 與錯誤訊號 `{ error: 'Time range overlaps with an existing request' }`。
4. **強制變更密碼**：首登使用者所有 API 請求（除了 auth 相關與變更密碼外）皆被阻擋並要求先更新密碼。
5. **主題切換**：點擊右上角主題切換按鈕，UI 配色立即切換且刷新頁面後依然保留偏好。

### 介面與資料格式 (Interface / Data Shape)
- **資料庫變更**：
  - `users` 表新增 `must_change_password BOOLEAN DEFAULT TRUE` 欄位（需修改 `init.sql`）。
  - `approval_logs` 表的 `request_type` 欄位 CHECK 約束調整為 `CHECK (request_type IN ('LEAVE', 'OVERTIME', 'BALANCE'))`。
- **API 變更**：
  - `PUT /api/auth/password` -> 傳入 `{ oldPassword, newPassword }`，更新密碼，將 `must_change_password` 設為 `false`。
  - `GET /api/auth/me` 回傳的 JSON 結構中包含 `must_change_password` 欄位。

### 錯誤與異常處理 (Failure Modes)
- **強制修改密碼攔截**：API 回傳 `403 Forbidden` 與 `{ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' }`。
- **時間重疊**：API 回傳 `400 Bad Request` 與 `{ error: 'Leave request time range overlaps with another active request' }`。

### 驗證標準 (Acceptance Criteria)
- 前端 React 能正常執行於 `http://localhost:3000`，後端 Express 正常執行於 `http://localhost:5000`。
- 新增使用者後登入，前端能正確跳出密碼重設強制視窗，且關閉或點擊其他分頁時會被彈回。
- 嘗試請假重疊時段會顯示錯誤訊息且無法送出。
- 請假時數能正確避開週末及下班時間。

## Risks / Trade-offs

- **[Risk] 使用者直接用 API 繞過密碼強制變更限制** ➔ **[Mitigation]** 在後端 Auth Middleware 中檢查 `must_change_password` 狀態。若為 `true` 且非變更密碼 API 請求（`PUT /api/auth/password`）或獲取個人資訊 API（`GET /api/auth/me`），一律攔截並回傳 `403 Forbidden`。
- **[Risk] 主題切換造成亮色模式文字模糊** ➔ **[Mitigation]** 完整檢視 [index.css](file:///C:/Workspace/vibe-coding/vibe-docker/frontend/src/index.css)，將 `--text-primary`、`--text-secondary` 等顏色定義清楚，避免直接繼承預設白色。
