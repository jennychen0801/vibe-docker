# attendance-management Specification

## Purpose

TBD - created by archiving change 'setup-attendance-system'. Update Purpose after archive.

## Requirements

### Requirement: User Creation and Password Delivery
系統應（SHALL）允許管理員建立新使用者。建立使用者時，系統必須（MUST）自動生成一個隨機臨時密碼，並發送至使用者的電子信箱。系統應（SHALL）要求使用臨時密碼登入的使用者在首次登入時變更其密碼。系統必須（MUST）阻擋所有其他應用程式功能，直到密碼變更完成為止。

#### Scenario: Force Password Change on First Login
- **當（WHEN）** 使用者首次使用臨時密碼登入
- **則（THEN）** 系統將使用者重導向至密碼變更頁面，並阻擋對所有其他功能的存取，直到密碼完成變更。


<!-- @trace
source: enhance-attendance-system
updated: 2026-05-25
code:
  - backend/package.json
  - frontend/src/App.tsx
  - backend/src/index.ts
  - backend/db/init.sql
  - package.json
  - frontend/src/index.css
-->

---
### Requirement: Clock In and Out Recording
系統應（SHALL）允許通過驗證的使用者進行上下班打卡動作。對於每筆打卡紀錄，系統必須（MUST）儲存時間戳記、使用者 ID、交易類型（IN 或 OUT）、客戶端 IP 位址，以及客戶端 GPS 座標（若可用）。

#### Scenario: Successful Clock-in
- **當 (WHEN)** 通過驗證的使用者點選「打卡上班」時
- **則 (THEN)** 系統會建立一筆包含當前時間戳記、交易類型為「IN」、使用者 IP 以及使用者 GPS 座標的打卡紀錄。

---
### Requirement: Leave Request Approval Workflow
系統應（SHALL）對請假申請執行基於狀態的審核流程。申請狀態的流轉必須（MUST）遵循：`PENDING_PROXY` -> `PENDING_APPROVAL` -> `APPROVED` 或 `REJECTED`。
- 當請假申請送出時，狀態應（SHALL）進入 `PENDING_PROXY`。
- 指定的職務代理人必須（MUST）同意該申請以將狀態轉移至 `PENDING_APPROVAL`，或退回該申請以將狀態轉移至 `REJECTED`。
- 指定的主管/審核人必須（MUST）核准該申請以將狀態轉移至 `APPROVED`，或退回該申請以將狀態轉移至 `REJECTED`。
- 系統應（SHALL）防範提交任何與該使用者現有待處理（pending）或已核准（approved）之請假單在時間上重疊的請假申請。
- 系統應（SHALL）僅計算工作時間（週一至週五 09:00 - 18:00）來計算請假申請的時數，並排除非工作時間、週末以及午休時間（12:00 - 13:00）。

#### Scenario: Prevent Overlapping Leave Requests
- **假設（GIVEN）** 使用者已有一張已核准的請假單，時間為 2026-06-01 09:00 至 2026-06-01 18:00
- **當（WHEN）** 使用者嘗試提交一張與此時間範圍重疊的新請假申請
- **則（THEN）** 系統退回該申請，並回傳 400 Bad Request 錯誤。

#### Scenario: Business Hours Leave Duration Calculation
- **當（WHEN）** 使用者申請從週一 09:00 至週一 18:00（全天）的請假
- **則（THEN）** 系統計算出的請假時數應剛好為 8 小時（經過 9 小時扣除 1 小時午休）。

##### Example: Duration calculation with weekends and business hours
| 開始時間 | 結束時間 | 計算出的時數（小時） | 說明備註 |
| :--- | :--- | :--- | :--- |
| 週一 09:00 | 週一 18:00 | 8 | 1 個工作日（9 小時扣除 1 小時午休） |
| 週五 15:00 | 週一 12:00 | 6 | 週五 15:00-18:00 (3h) + 週一 09:00-12:00 (3h)，排除週末。 |
| 週一 12:00 | 週一 13:00 | 0 | 處於午休時間內 |


<!-- @trace
source: enhance-attendance-system
updated: 2026-05-25
code:
  - backend/package.json
  - frontend/src/App.tsx
  - backend/src/index.ts
  - backend/db/init.sql
  - package.json
  - frontend/src/index.css
-->

---
### Requirement: Overtime Request and Comp-time Conversion
系統應（SHALL）允許使用者提交加班申請。當加班申請轉移至 `APPROVED` 狀態時，系統必須（MUST）自動將核准的加班時數累加至使用者的補休額度中。

#### Scenario: Overtime Approval Auto-adds Comp-time
- **當 (WHEN)** 主管核准使用者 4 小時的加班申請時
- **則 (THEN)** 使用者的補休額度會精確增加 4 小時。

##### Example: Compensatory time conversion
| 初始額度 (小時) | 核准加班時數 | 最終額度 (小時) |
| :--- | :--- | :--- |
| 0 | 4 | 4 |
| 2.5 | 3 | 5.5 |

---
### Requirement: Leave Balance Adjustments and Auditing
系統應（SHALL）允許管理員調整使用者的請假額度。當管理員調整請假額度時，系統必須（MUST）將變更日誌記錄於 `approval_logs` 資料表中，並將 `request_type` 設為 'BALANCE'。

#### Scenario: Admin Modifies Balance and Records Log
- **當（WHEN）** 管理員將使用者的特休年假額度從 40 小時更新為 32 小時
- **則（THEN）** 系統更新資料庫，並記錄一筆變更日誌，詳細載明管理員的 ID、操作行為、說明備註及變更時間。


<!-- @trace
source: enhance-attendance-system
updated: 2026-05-25
code:
  - backend/package.json
  - frontend/src/App.tsx
  - backend/src/index.ts
  - backend/db/init.sql
  - package.json
  - frontend/src/index.css
-->

---
### Requirement: User Interface Theme Persistence
系統應（SHALL）允許使用者在亮色（Light）與暗色（Dark）視覺主題之間進行切換。系統必須（MUST）將所選的主題持久化儲存於瀏覽器的本地儲存空間（localStorage）中。

#### Scenario: Theme Selection Persistence
- **當（WHEN）** 使用者選擇「亮色模式」（Light Mode）
- **則（THEN）** 系統更新視覺主題，並將此偏好儲存於本地儲存空間，以便在下一次使用時仍能保持生效。

<!-- @trace
source: enhance-attendance-system
updated: 2026-05-25
code:
  - backend/package.json
  - frontend/src/App.tsx
  - backend/src/index.ts
  - backend/db/init.sql
  - package.json
  - frontend/src/index.css
-->