> 2026-10-05 v17：新增每日到訪集章與簽退成果小卡，回顧整合於「我的健身足跡」。更新步驟與計次規則見 [UPDATE_FOOTPRINTS.md](./UPDATE_FOOTPRINTS.md)。

> 2026-10-05 更新：新增只存手機瀏覽器的「訓練助手」。部署方式與本機備份說明見 [UPDATE_LOCAL_TRAINING.md](./UPDATE_LOCAL_TRAINING.md)。

# Gym Check-in Web App

運動科學實驗室簽到系統，以 GitHub Pages 提供多頁式前端，並使用
Supabase 作為驗證、PostgreSQL 資料庫與 Edge Functions 後端。

## 線上網站

<https://death-momoi.github.io/gym-checkin-webapp/>

## 功能頁面

- `index.html`：Google 登入／登出、簽到、簽退、設備檢查與責任交接
- `checkin.html`：保留舊版簽到／簽退直接連結的相容頁面
- `overview.html`：以當日時間軸同時顯示實際使用與 Google Calendar 預約
- `present.html`：目前在場人員
- `assist.html`：協助共同使用者簽退
- `calendar.html`：Google Calendar 預約查詢
- `foodwheel.html`：預設分類與自訂店家的美食轉盤
- `history.html`：依日期查詢簽到紀錄
- `report.html`：問題回報與 Gmail 通知
- `admin.html`：所有登入者查看並依日期篩選回報；僅管理員可更新處理狀態
- `guide.html`：系統用途、簽到流程與功能使用說明
- `privacy.html`：公開的隱私權政策與 Google API 資料使用說明
- `terms.html`：公開的服務條款

「總覽圖表」、「目前在場」、「預約月曆」與「簽到紀錄」收納於
左側功能列的「借用狀態」子選單。所有頁面共用 `assets/common.js`
的 Supabase 登入狀態與左側滑出功能列，
視覺樣式集中於 `assets/styles.css`。

## 後端

- Supabase Auth：Google OAuth 登入
- Supabase PostgreSQL：個人資料、簽到紀錄與問題回報
- 現場 QR 驗證：由可信任裝置簽發 60 秒短效 Token，簽到時由資料庫驗證
- 首次登入姓名綁定：每個 Google 帳號確認一次姓名後寫入 `profiles`
- Row Level Security：限制匿名存取並依登入身分控管資料
- `admin_set_issue_status`：僅限 active 管理員解決或重新開啟問題
- `send-issue-email`：透過 Gmail API 寄送問題通知
- `get-calendar-events`：讀取並篩選 Google Calendar 預約
- `issue-presence-token`：驗證現場裝置並簽發可供多人於 60 秒內掃描的 QR Token

總覽圖表、預約月曆、簽到紀錄與問題回報處理頁共用日期選擇器，
藍點一律只標示「當天有人實際簽到」的日期，不因只有預約而顯示。
`get-calendar-events` 同時支援單日預約與月份有效日期；
前端呼叫 Edge Function 時會明確傳送使用者 access token，並在 401 後重新整理
登入狀態再重試一次。

## Edge Function Secrets

實際值只設定於 Supabase，不可提交至 GitHub：

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `GMAIL_SENDER_EMAIL`
- `ISSUE_NOTIFICATION_TO`
- `CHECKIN_APP_URL`（值為 `https://death-momoi.github.io/gym-checkin-webapp/`）

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Edge Functions
執行環境提供，不可放進前端或 PC 程式。

## 現場 QR 簽到

- 沒有有效現場 Token 時，網頁仍可登入、檢視資料與簽退，但不能簽到。
- QR 過期後仍會開啟網站，頁面會明確顯示已過期並停用簽到按鈕。
- 簽退不需要 Token；已簽到者從含 Token 的 QR 連結進入也能正常簽退。
- 同一 Token 在 60 秒有效期內可由多人使用，不會因第一人簽到而失效。
- `pc_qr_generator/` 提供 240 × 240 電腦測試畫面，日後 ESP32 可沿用同一 API。

完整部署順序請見 `DEPLOY_PRESENCE_QR.md`。

## 部署

提交至 `main` 後，由 GitHub Pages 更新前端，既有 GitHub Action 套用資料庫
migrations。Edge Function 程式碼更新後，另於 Supabase Dashboard 部署。
