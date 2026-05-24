# attendance-management Specification

## Purpose

TBD - created by archiving change 'setup-attendance-system'. Update Purpose after archive.

## Requirements

### Requirement: User Creation and Password Delivery
系統應（SHALL）允許管理員建立新使用者。建立使用者時，系統必須（MUST）自動生成一個隨機臨時密碼，並發送至使用者的電子信箱。

#### Scenario: Create User and Send Email
- **當 (WHEN)** 管理員送出新使用者的信箱與詳細資訊時
- **則 (THEN)** 系統會在資料庫中建立該使用者、生成臨時密碼，並發送一封包含密碼的郵件至該使用者的電子信箱。

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

#### Scenario: Multi-stage Leave Approval Process
- **當 (WHEN)** 使用者送出請假申請並指定職務代理人與審核人時
- **則 (THEN)** 申請狀態會被設為 `PENDING_PROXY`
- **當 (WHEN)** 職務代理人同意該申請時
- **則 (THEN)** 申請狀態轉移至 `PENDING_APPROVAL`
- **當 (WHEN)** 審核人核准該申請時
- **則 (THEN)** 申請狀態轉移至 `APPROVED`

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
