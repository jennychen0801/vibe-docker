## Why

為了解決出缺勤管理的需求，並確保開發環境與生產環境的統一與獨立性，本專案引進了 Docker Compose 架構，整合了 React 前端、Express 後端、Postgres 資料庫、資料庫管理工具 pgAdmin 以及開發用的虛擬郵件代理 Maildev，打造出一個完整的出缺勤管理系統。

## What Changes

主要變更如下：
- **前端 React**：實作登入頁面、出缺勤打卡面板、請假與加班申請表單（支援代理人與主管指派）、待審核清單與管理員後台。
- **後端 Express**：實作使用者管理（Admin 權限）、密碼隨機生成與發送、打卡記錄、請假狀態機（代理人同意 ➔ 主管審核 ➔ 扣除額度）、以及加班補休自動轉換。
- **資料庫 Postgres**：設計 6 張核心資料表（`users`, `clock_records`, `leave_requests`, `overtime_requests`, `leave_balances`, `approval_logs`）以確保資料強一致性。
- **郵件服務 Maildev**：提供本地虛擬 SMTP Server 及 Web 郵件檢視介面，用於接收隨機密碼通知信與簽核通知。
- **Docker Compose**：配置一鍵啟動所有相關服務容器，實現極簡部署與開發。

## Capabilities

### New Capabilities

- `attendance-management`：提供核心出缺勤管理，包含打卡定位紀錄、多階層請假簽核工作流、加班時數轉換補休額度等功能。

### Modified Capabilities

(無)

## Impact

- Affected specs:
  - `specs/attendance-management/spec.md`
- Affected code:
  - New:
    - `docker-compose.yml`
    - `frontend/package.json`
    - `frontend/tsconfig.json`
    - `frontend/vite.config.ts`
    - `frontend/index.html`
    - `frontend/src/main.tsx`
    - `frontend/src/App.tsx`
    - `frontend/src/index.css`
    - `backend/package.json`
    - `backend/tsconfig.json`
    - `backend/src/index.ts`
  - Modified:
    - `.gitignore`
  - Removed:
    - (無)
