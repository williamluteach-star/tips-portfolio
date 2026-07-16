# TIPS 學習歷程平台 — Phase 1（W1–W2 交付）

包含：素材倉庫、三年進度儀表板、時程中心、LINE 彙整式提醒、簡易登入。
規格請參照 `tips-portfolio-spec.md`。

## 目錄結構

```
apps-script/   後端（Google Apps Script）
  config.gs    全域設定
  setup.gs     資料庫初始化＋學生匯入
  api.gs       Web App API（登入、素材 CRUD、檔案上傳、時程）
  line.gs      LINE 彙整式提醒（月報＋週報）
frontend/      前端（React + Vite）
```

## 部署步驟

### A. 後端（約 15 分鐘）

1. 到 https://script.google.com 建立新專案，命名「TIPS 學習歷程平台」。
2. 建立四個檔案，分別貼上 `config.gs`、`setup.gs`、`api.gs`、`line.gs` 的內容。
3. 在 `config.gs` 修改 `TEACHER_EMAILS` 為你的 Gmail。
4. 於編輯器選擇函式 `setupDatabase` 執行一次（首次會要求授權）。
   - 執行紀錄會顯示試算表與 Drive 資料夾網址。
5. 執行 `addTestStudent()` 建立測試帳號，記下 log 中的 student_id 與 login_code。
6. 部署：右上「部署」→「新增部署作業」→ 類型「網頁應用程式」：
   - 執行身分：**我**
   - 誰可以存取：**任何人**
   - 複製產生的 `/exec` 網址。

### B. 前端（約 10 分鐘）

1. 修改 `frontend/src/api.js` 的 `API_URL` 為上一步的 `/exec` 網址。
2. 本機測試：
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   用測試帳號登入驗證流程。
3. 部署（GitHub Pages + 自訂子網域 `portfolio.tips-edu.com`）：
   ```bash
   # 在 GitHub 建立 repo：tips-portfolio，然後
   cd tips-portfolio
   git init && git add . && git commit -m "Phase 1"
   git remote add origin https://github.com/<你的帳號>/tips-portfolio.git
   git push -u origin main
   cd frontend && npm run build
   npx gh-pages -d dist          # 部署 dist/ 到 gh-pages 分支（含 CNAME 檔）
   ```
   - repo Settings → Pages → Source 選 `gh-pages` 分支；Custom domain 填 `portfolio.tips-edu.com`，勾選 Enforce HTTPS。
   - 到網域商（tips-edu.com 的 DNS 管理）新增一筆 CNAME 紀錄：
     主機名稱 `portfolio` → 目標 `williamluteach-star.github.io`
   - DNS 生效約 10 分鐘～數小時，之後 `https://portfolio.tips-edu.com` 即上線。
   - `frontend/public/CNAME` 已放好、`vite.config.js` base 維持 `'/'`，不需再改。

### C. LINE 提醒（約 10 分鐘）

1. 沿用 TIPS 現有 LINE 官方帳號，到 LINE Developers 取得 Channel Access Token。
2. Apps Script →「專案設定」→「指令碼屬性」新增 `LINE_TOKEN` = 該 token。
3. 設定觸發器（左側鬧鐘圖示）：
   - `sendMonthlyDigest`：時間驅動 → 月計時器 → 每月 1 日
   - `sendWeeklyDigestIfNeeded`：時間驅動 → 週計時器 → 每週一
4. 學生的 `line_user_id` 需填入 students 分頁（可從既有招生系統的好友名單取得）。

### D. 匯入正式學生

準備一張試算表，欄位依序：`姓名｜學制(general/vocational)｜學校｜年級(10-12)｜班別｜LINE userId`，
然後在 Apps Script 執行：
```javascript
addStudentsFromSheet('來源試算表ID', '分頁名稱')
```
登入代碼會自動產生於 students 分頁的 `login_code` 欄，發給學生即可。

## 成本備忘

- 前端託管、Apps Script、Sheets、Drive：NT$0
- LINE：每月推播 ≤4 次 × 50 人 = 200 則，落在輕用量免費額度
- 詳細試算見規格書 §9

## 已知限制（Phase 1）

- 登入代碼為簡易驗證，僅適合內部使用；公開化（Phase 3）需換 OAuth。
- Apps Script 單次執行 6 分鐘上限；學生數 >500 時建議遷移 Supabase。
- 檔案上傳走 base64，實測 4MB 檔案約需 10–20 秒，屬正常現象。

## 下一步（W3–W4）

- 老師後台（學生進度總表、截止日維護介面）
- 圖文選單「查詢我的時程」Reply API webhook
- Phase 2：AI 撰寫教練（Cloudflare Workers + Claude API）
