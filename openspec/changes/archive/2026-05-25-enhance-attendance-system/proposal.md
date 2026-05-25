## Why

為了解決出缺勤系統在實際企業環境中的安全性防護不足（如臨時密碼無過期/變更機制、額度調整無日誌紀錄）、時數扣除不精準（含下班與週末時間）、缺乏請假衝突防呆以及本地多模組管理繁瑣的問題，我們需要實作工作區管理、精準時數計算、密碼強制變更與亮暗色主題切換等功能。

## What Changes

- **專案結構優化**：建立 Npm Workspaces 管理前後端模組，提供根目錄一鍵安裝與同步開發腳本。
- **請假邏輯優化**：
  - **時數精準計算**：計算請假時數時排除六日與非工作時間（僅計平日 09:00 - 18:00 並扣除中午 12:00 - 13:00）。
  - **時間重疊防呆**：阻擋相同員工在相同時間區間內重複送出多張未被退回的假單。
  - **表單預設值**：請假申請表單預設時間設定為今日 09:00 至 18:00。
- **安全性與稽核**：
  - **強制修改密碼**：新增修改密碼 API，新建立之員工在首次登入時必須強制變更密碼後才能進行其他系統操作。
  - **額度調整日誌**：記錄管理員後台調整員工額度的審計軌跡至 `approval_logs` 中。
- **使用者介面優化**：利用 CSS 變數實作 Light/Dark Mode 亮暗色主題切換，抽離行內樣式以利維護。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `attendance-management`: 調整請假時數計算公式以扣除非工作時間，加入請假重疊衝突防範規則，實作強制修改密碼與額度修改稽核日誌。

## Impact

- Affected specs:
  - `openspec/specs/attendance-management/spec.md`
- Affected code:
  - New:
    - `package.json`
  - Modified:
    - `backend/package.json`
    - `frontend/package.json`
    - `backend/db/init.sql`
    - `backend/src/db.ts`
    - `backend/src/index.ts`
    - `frontend/src/App.tsx`
