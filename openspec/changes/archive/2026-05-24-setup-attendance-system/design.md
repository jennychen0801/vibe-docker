## Context

目前專案為全新初始化，無任何現有的出缺勤管理程式碼。為了滿足員工打卡、請假、加班申請及主管簽核的需求，我們需要設計一個全端架構。為了確保開發環境與生產環境的統一，我們將使用 Docker Compose 來整合前端 React、後端 Express、資料庫 Postgres、資料庫管理工具 pgAdmin 以及開發用的虛擬郵件伺服器 Maildev。

## Goals / Non-Goals

**Goals:**
- 建立一個包含 React 前端、Express 後端與 Postgres 資料庫的出缺勤系統。
- 提供上下班打卡功能（記錄打卡時間、IP 與 GPS 座標）。
- 提供自訂簽核狀態機的請假功能（申請人 ➔ 代理人確認 ➔ 主管審核）。
- 提供加班申請功能，且審核通過後自動將加班時數累加至員工的補休額度中。
- 提供管理員後台，用於管理使用者、發送自動產生的初始密碼信（寄送至 Docker 本地 Maildev 預覽）。
- 支援透過 Docker Compose 一鍵啟動所有容器服務。

**Non-Goals:**
- 不對打卡位置進行強制性的地理限制（例如：不限制必須在公司半徑內才能點擊打卡，只做記錄）。
- 不實作自動化的年假額度定期發放排程（年假一律由管理者手動在後台進行調整）。

## Decisions

### Decision 1: 使用 Postgres 關聯式資料庫設計 6 張核心資料表
- **Rationale**: 出缺勤系統涉及請假餘額扣除、加班時數轉換以及簽核記錄，對資料一致性的要求極高。關聯式資料庫能以 ACID 事務確保資料的準確性。
- **Alternatives**: MongoDB (NoSQL) — 雖然寫入快速，但在跨表交易（如加班單核准同時更新餘額表）的強一致性上實作較繁瑣。

### Decision 2: 請假與加班審核的狀態機設計
- **Rationale**: 
  - 請假單狀態機：`DRAFT` ➔ `PENDING_PROXY` (待代理人同意) ➔ `PENDING_APPROVAL` (待主管審核) ➔ `APPROVED` / `REJECTED`。
  - 加班單狀態機：`DRAFT` ➔ `PENDING_APPROVAL` ➔ `APPROVED` / `REJECTED`。
  - 當加班單變更為 `APPROVED` 時，後端將在同一個 DB Transaction 中累加該使用者的補休額度。
- **Alternatives**: 每次需要額度時去加總所有歷史加班單，但這在資料量大時會導致效能低落，因此採取維護一個 `leave_balances` 餘額表的做法。

### Decision 3: 使用 Docker 內建 Maildev 作為開發郵件代理
- **Rationale**: 新增使用者時需要寄送隨機密碼，且簽核時需要通知。開發環境下不需要配置真實的 SMTP（如 Gmail App 密碼），Maildev 能提供一個本地 SMTP Server 以及精美的 Web 郵件預覽面板。
- **Alternatives**: 僅在 Console 印出郵件內容 — 這會導致前端無法驗證郵件 HTML 的樣式與排版。

## Implementation Contract

### 系統行為 (Behavior)
1. **使用者管理**: 管理者在後台新增使用者，系統隨機生成密碼並以郵件通知。
2. **打卡功能**: 員工點擊打卡後，後端透過連線資訊取得 client IP 並寫入。
3. **請假申請**: 員工申請時需指定同仁為代理人、指定主管為審核人。
4. **補休扣除/增加**: 申請補休時扣除 `compensatory_hours`；加班審核通過時增加 `compensatory_hours`。

### 介面與資料格式 (Interface / Data Shape)
* **API 端點**:
  - `POST /api/auth/login` -> 傳入 `{ email, password }`，回傳 JWT Token。
  - `POST /api/users` -> (僅限 Admin) 傳入 `{ name, email, role, manager_id }`，回傳建立的使用者資料。
  - `POST /api/clock` -> 傳入 `{ type: 'IN' | 'OUT', gps_coords: { lat: number, lng: number } | null }`。
  - `POST /api/leaves` -> 傳入 `{ leave_type: 'ANNUAL' | 'COMPENSATORY', start_time: string, end_time: string, reason: string, proxy_id: string, approver_id: string }`。
  - `POST /api/overtime` -> 傳入 `{ date: string, hours: number, reason: string }`。

* **資料庫 Schema**:
  - `users` (id, email, password_hash, role: 'ADMIN'|'MANAGER'|'USER', name, manager_id, created_at)
  - `clock_records` (id, user_id, type: 'IN'|'OUT', timestamp, ip, gps_coords: JSONB)
  - `leave_requests` (id, user_id, leave_type: 'ANNUAL'|'COMPENSATORY', start_time, end_time, reason, status: 'PENDING_PROXY'|'PENDING_APPROVAL'|'APPROVED'|'REJECTED', proxy_user_id, approver_id)
  - `overtime_requests` (id, user_id, date, hours, reason, status: 'PENDING_APPROVAL'|'APPROVED'|'REJECTED', approver_id)
  - `leave_balances` (id, user_id, annual_hours, compensatory_hours)
  - `approval_logs` (id, request_type: 'LEAVE'|'OVERTIME', request_id, operator_id, action: 'APPROVE'|'REJECT', comment, timestamp)

### 錯誤與異常處理 (Failure Modes)
- **登入失敗**: 回傳 `401 Unauthorized` 與 `{ error: 'Invalid credentials' }`。
- **額度不足**: 請假時若 `leave_balances` 中對應的時數小於請假時數，回傳 `400 Bad Request` 與 `{ error: 'Insufficient leave balance' }`。
- **權限不足**: 非 Admin 存取使用者管理 API，回傳 `403 Forbidden`。

### 驗證標準 (Acceptance Criteria)
- 前端 React 啟動於 `http://localhost:3000`，後端 Express 啟動於 `http://localhost:5000`。
- pgAdmin 啟動於 `http://localhost:5555`（或指定埠口），Maildev 啟動於 `http://localhost:1080`。
- 新增使用者後，可在 Maildev 介面中查閱該封密碼通知信，並能成功登入。
- 請假申請送出後，資料表狀態應為 `PENDING_PROXY`。代理人同意後更新為 `PENDING_APPROVAL`，主管同意後更新為 `APPROVED`，此時 `leave_balances` 應正確扣除該請假時數。

## Risks / Trade-offs

- **[Risk] 打卡時 GPS 定位遭瀏覽器拒絕** ➔ **[Mitigation]** 後端 `gps_coords` 設為 nullable。若前端無法取得，僅將其記為 null，並不阻擋打卡。
- **[Risk] 生產環境無法使用 Maildev** ➔ **[Mitigation]** 後端發信模組（如 Nodemailer）的 SMTP 連接參數需使用環境變數設定。開發環境指向 Maildev 容器，生產環境替換為 AWS SES 或 SendGrid。
