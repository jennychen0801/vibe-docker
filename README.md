# 出缺勤與加班管理系統 (Attendance & Overtime Management System)

這是一個基於 Docker 容器化架構的全端出缺勤管理系統。本系統專為現代企業設計，支援員工打卡紀錄（含 IP 與 GPS 座標）、自訂多階請假審核工作流（申請人 ➔ 代理人同意 ➔ 主管審核），以及加班自動轉換為補休額度等核心業務邏輯。

---

## 🚀 技術棧 (Tech Stack)

### 前端 (Frontend)
- **React 18** (TypeScript + Vite)
- **Lucide React** (圖標庫)
- **Vanilla CSS** (現代化自訂樣式系統，支援響應式佈局)

### 後端 (Backend)
- **Node.js** (Express.js + TypeScript + `ts-node-dev`)
- **Nodemailer** (郵件發送服務)
- **node-pg** (PostgreSQL 連接池)
- **JSON Web Token (JWT)** & **Bcrypt.js** (身分驗證與密碼雜湊)

### 資料庫與基礎建設 (Database & DevOps)
- **PostgreSQL 15** (關聯式資料庫，維護 6 張核心關聯資料表)
- **Maildev** (開發用虛擬 SMTP 伺服器與郵件檢視介面)
- **pgAdmin 4** (資料庫圖形化管理工具)
- **Docker & Docker Compose** (容器化一鍵啟動)

---

## 🛠️ 安裝與啟動步驟

### 前提條件 (Prerequisites)
請確保您的系統已安裝：
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 並且已啟動。
- Node.js 18+ (如果您需要在本地執行測試腳本)。

### 一鍵啟動環境
在專案根目錄下，開啟終端機並執行以下指令：

```bash
docker compose up -d
```

此指令會自動編譯前後端鏡像並啟動以下 5 個容器服務：
1. `attendance-db`: PostgreSQL 資料庫 (Port `5432`)
2. `attendance-maildev`: Maildev 郵件伺服器 (Port `1080` Web / `1025` SMTP)
3. `attendance-pgadmin`: pgAdmin 資料庫管理平台 (Port `5555`)
4. `attendance-backend`: Express 後端 API 服務 (Port `5000`)
5. `attendance-frontend`: React 前端應用程式 (Port `3000`)

---

## 🎯 服務存取路徑

啟動成功後，您可以透過瀏覽器存取以下服務：
- **系統前端頁面**：[http://localhost:3000](http://localhost:3000)
- **虛擬郵件收件匣 (Maildev)**：[http://localhost:1080](http://localhost:1080)
- **資料庫管理後台 (pgAdmin)**：[http://localhost:5555](http://localhost:5555)
  - *登入信箱*：`admin@admin.com`
  - *登入密碼*：`adminpassword`

---

## 🔑 預設測試帳號

系統初始化時會自動寫入以下三種角色的測試帳號：
| 角色 | 電子信箱 | 密碼 | 初始年假額度 | 補休額度 |
| :--- | :--- | :--- | :--- | :--- |
| **系統管理員 (ADMIN)** | `admin@attendance.com` | `admin123` | 80 小時 | 0 小時 |
| **部門主管 (MANAGER)** | `manager@attendance.com` | `manager123` | 80 小時 | 0 小時 |
| **一般員工 (USER)** | `user@attendance.com` | `user123` | 80 小時 | 0 小時 |

*(註：一般員工 `user@attendance.com` 的直屬主管已預設指派為 `manager@attendance.com`)*。

---

## 📖 核心功能測試指引

### 1. 使用者管理與臨時密碼發送
1. 使用管理者 `admin@attendance.com` 登入前端系統。
2. 進入使用者管理後台，新增一位新員工（如 `test@attendance.com`），直屬主管設為 `部門主管`。
3. 系統會自動生成隨機密碼並寄出。請前往 [Maildev Web 介面](http://localhost:1080) 查收該員工的初始密碼信。

### 2. 上下班打卡
1. 使用該新員工的帳號與收到的臨時密碼登入系統。
2. 點選「上班打卡」或「下班打卡」，系統將會取得 Client IP 以及 GPS 座標（可允許或拒絕）並寫入資料庫。

### 3. 多階請假審核流與額度自動扣除
1. 新員工提出請假申請（例如請 `ANNUAL` 特休 8 小時），必須指定代理人（選 `部門主管`）與審核主管（選 `系統管理員`）。
2. 送出後狀態為 `PENDING_PROXY` (待代理人同意)。
3. 登入代理人帳號 `manager@attendance.com` 前往待辦事項點擊「同意」，狀態流轉為 `PENDING_APPROVAL` (待主管審核)。
4. 登入管理員帳號 `admin@attendance.com` 前往待辦清單點擊「核准」，狀態流轉為 `APPROVED`。
5. 登回該員工帳號，可確認其特休額度已成功扣除 8 小時。

### 4. 加班申請與補休累積
1. 一般員工提出加班申請（如 4 小時），直屬主管核准後，員工帳號的補休額度（Compensatory Hours）將自動累加 4 小時。

---

## 🧪 自動化整合測試

後端目錄下包含一個全自動化的整合測試腳本，能在一秒內模擬上述的所有使用者登入、新建使用者、提取 Maildev 密碼、打卡、請假狀態流轉扣額度、加班累加等全部流程。

要在本地端執行該測試：
1. 確保 Docker 容器均已正常啟動在背景。
2. 進入 `backend` 目錄並執行：

```bash
cd backend
npx ts-node --transpile-only src/run-live-tests.ts
```
