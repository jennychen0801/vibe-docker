## 1. 系統初始化與 Docker 環境配置

- [x] 1.1 實作 `Decision 3: 使用 Docker 內建 Maildev 作為開發郵件代理`，以及 Postgres 和 pgAdmin 的 `docker-compose.yml` 容器配置，提供虛擬郵件伺服器。當執行 `docker-compose up -d` 時，所有容器應正常啟動且 `localhost:1080` 能顯示 Maildev 介面。驗證方式：執行 `docker-compose up` 並手動連線測試各個 port 的回應。
- [x] 1.2 實作 `Decision 1: 使用 Postgres 關聯式資料庫設計 6 張核心資料表` 的資料庫初始化腳本，滿足 `介面與資料格式 (Interface / Data Shape)` 的 schema 宣告。在容器啟動時，會自動建立 `users`、`clock_records`、`leave_requests`、`overtime_requests` , `leave_balances` 和 `approval_logs` 6 張表及其外鍵關係。驗證方式：透過 pgAdmin 登入資料庫並執行 `\dt` 檢查資料表結構與外鍵。

## 2. 後端 API 與業務邏輯

- [x] 2.1 實作 `User Creation and Password Delivery` 的後端 API（`POST /api/users`），遵循 `系統行為 (Behavior)` 與 `錯誤與異常處理 (Failure Modes)` 規範，包含管理員權限驗證與隨機密碼發送郵件邏輯。驗證方式：使用 Postman/curl 發送請求建立新使用者，並確認本地 Maildev `localhost:1080` 成功收到包含密碼的通知信，且該密碼雜湊值已寫入資料庫。
- [x] 2.2 實作 `Clock In and Out Recording` 的後端 API（`POST /api/clock`），接收並寫入使用者的打卡類型、時間、IP 以及 GPS 經緯度資料，符合 `系統行為 (Behavior)` 與 `介面與資料格式 (Interface / Data Shape)` 規範。驗證方式：模擬打卡請求並傳送一組 GPS 座標，檢查 `clock_records` 資料表是否成功新增一筆包含正確 IP 與 JSONB 格式 GPS 的記錄。
- [x] 2.3 實作 `Decision 2: 請假與加班審核的狀態機設計` 中關於 `Leave Request Approval Workflow` 的假單建立與狀態流轉邏輯（`PENDING_PROXY` -> `PENDING_APPROVAL` -> `APPROVED`），並處理 `錯誤與異常處理 (Failure Modes)` 的額度不足與權限判定。驗證方式：發送請假 API 請求，檢查資料庫中的狀態是否為 `PENDING_PROXY`，接著模擬代理人與主管的審核 API，確認狀態流轉為 `APPROVED` 且對應扣除 `leave_balances` 中的年假或補休額度。
- [x] 2.4 實作 `Overtime Request and Comp-time Conversion` 的加班申請與自動額度轉換邏輯，遵循 `系統行為 (Behavior)` 加班核准即自動累加。驗證方式：送出並核准一筆 4 小時的加班單，手動執行 SQL 查詢 `leave_balances` 確認 `compensatory_hours` 增加了 4 小時。

## 3. 前端 UI 與端對端整合

- [x] 3.1 實作登入頁面與打卡面板。員工登入後可進行上下班打卡，並在介面上顯示本日打卡狀態與歷史記錄，滿足 `驗證標準 (Acceptance Criteria)` 的前端運作。驗證方式：在網頁上執行打卡，頁面應立即更新打卡成功狀態，並能在瀏覽器控制台看見發送的打卡 API Payload。
- [x] 3.2 實作請假與加班申請表單，並在填寫假單時提供代理人與審核主管的下拉式選單，符合 `驗證標準 (Acceptance Criteria)` 所述表單關聯。驗證方式：手動在前端申請請假與加班，並登入代理人與主管帳號，確認各自的簽核代辦清單中會出現該筆單據，且可以執行核准。
- [x] 3.3 實作管理員的使用者管理介面（新增、刪除、修改使用者、調整額度），以達 `驗證標準 (Acceptance Criteria)` 的系統整合要求。驗證方式：以管理員角色登入，新增一個使用者並指派直屬主管，隨後在列表中確認新使用者成功呈現，且該使用者的初始請假額度可正常被編輯保存。
