## 1. 專案結構與工作區配置

- [x] 1.1 實作 `Decision 1: 使用 Npm Workspaces 管理多模組專案`，在根目錄建立 [package.json](file:///C:/Workspace/vibe-coding/vibe-docker/package.json) 配置 `workspaces`，並整合啟動指令以實現一鍵啟動前後端。驗證方式：在根目錄執行 `npm install` 能成功安裝依賴，且執行 `npm run dev` 能同時順利啟動前後端服務。

## 2. 資料庫與後端安全性強化

- [x] 2.1 實作 `Decision 3: 首次登入強制變更密碼工作流與額度修改軌跡紀錄` 的資料庫 Schema 異動，以符合 `介面與資料格式 (Interface / Data Shape)` 的結構定義（修改 [backend/db/init.sql](file:///C:/Workspace/vibe-coding/vibe-docker/backend/db/init.sql)）：在 `users` 表新增 `must_change_password` 欄位，並將 `approval_logs` 表的 `request_type` CHECK 約束擴展至 `'BALANCE'`。驗證方式：在資料庫執行 `\d users` 與 `\d approval_logs` 檢查欄位與 CHECK 約束結構相符。
- [x] 2.2 實作 `User Creation and Password Delivery` 的首登強制更換密碼 `系統行為 (Behavior)`，以及針對未更換密碼的使用者進行 `錯誤與異常處理 (Failure Modes)` 阻擋（回傳 `403 Forbidden` 及 `PASSWORD_CHANGE_REQUIRED` 錯誤代碼）。驗證方式：使用未修改密碼的使用者 Token 請求 `/api/clock`，確認回傳 `403` 且 code 為 `PASSWORD_CHANGE_REQUIRED`。
- [x] 2.3 實作密碼變更 API 端點 `PUT /api/auth/password`，接受舊密碼與新密碼，驗證後更新並將 `must_change_password` 設為 `false`。驗證方式：發送請求至 `PUT /api/auth/password`，確認回傳成功，且資料庫中的 `must_change_password` 變為 `false`。
- [x] 2.4 實作 `Leave Balance Adjustments and Auditing` 機制：當管理員手動調整員工額度（`PUT /api/users/:id`）時，系統必須記錄變更日誌至 `approval_logs`，其 `request_type` 設為 `'BALANCE'`。驗證方式：呼叫 `/api/users/:id` 調整額度後，查詢 `approval_logs` 確認已寫入該筆異動日誌。

## 3. 請假審核邏輯與防呆強化

- [x] 3.1 實作 `Leave Request Approval Workflow` 的時間重疊檢查與 `Decision 2: 排除非工作時段的時數計算與時間重疊防呆`，防範同一員工在重疊時段內重複請假。驗證方式：提交兩張重疊時間的假單，第二張應被退回並收到 `400 Bad Request` 與錯誤 `{ error: 'Time range overlaps with an existing request' }`。
- [x] 3.2 實作請假時數計算核心邏輯，精準排除非工作日（週末）、中午休假（12:00 - 13:00）及非工作時段（18:00 - 09:00）。驗證方式：呼叫請假 API 傳入週五 15:00 至週一 12:00，確認計算出的時數為 6 小時。
- [x] 3.3 於前端請假申請表單預設帶入今日 `09:00` 與 `18:00` 作為初始起訖時間。驗證方式：開啟請假分頁，確認時間輸入框的預設值為今日 `09:00` 與 `18:00`。

## 4. 使用者介面主題切換與優化

- [x] 4.1 實作 `User Interface Theme Persistence` 與 `Decision 4: 使用 CSS 變數與 localStorage 實作手動主題切換`，在 CSS 中定義 `--bg-card` 與 `--text-primary` 等主題變數，抽離寫死的顏色樣式。驗證方式：在瀏覽器控制台手動修改根容器主題類別為亮色，確認所有卡片與文字配色能正常對比呈現以達 `驗證標準 (Acceptance Criteria)`。
- [x] 4.2 實作前端手動主題切換按鈕，點擊後即時切換主題樣式並持久化儲存偏好。驗證方式：點選前端畫面的亮暗色按鈕切換後重新整理頁面，確認主題依然保持切換後的狀態。
