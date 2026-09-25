# Gym Check-in Web App

運動科學實驗室簽到系統，以 GitHub Pages 提供多頁式前端，並使用
Supabase 作為驗證、PostgreSQL 資料庫與 Edge Functions 後端。

## 線上網站

<https://death-momoi.github.io/gym-checkin-webapp/>

## 功能頁面

- `index.html`：Google 登入與首頁捷徑
- `checkin.html`：簽到、簽退、設備檢查與責任交接
- `present.html`：目前在場人員
- `assist.html`：協助共同使用者簽退
- `calendar.html`：Google Calendar 預約查詢
- `history.html`：依日期查詢簽到紀錄
- `report.html`：問題回報與 Gmail 通知
- `admin.html`：管理員查看全部回報並更新處理狀態
- `privacy.html`：公開的隱私權政策與 Google API 資料使用說明
- `terms.html`：公開的服務條款

所有頁面共用 `assets/common.js` 的 Supabase 登入狀態與左側滑出功能列，
視覺樣式集中於 `assets/styles.css`。

## 後端

- Supabase Auth：Google OAuth 登入
- Supabase PostgreSQL：個人資料、簽到紀錄與問題回報
- Row Level Security：限制匿名存取並依登入身分控管資料
- `admin_set_issue_status`：僅限 active 管理員解決或重新開啟問題
- `send-issue-email`：透過 Gmail API 寄送問題通知
- `get-calendar-events`：讀取並篩選 Google Calendar 預約

## Edge Function Secrets

實際值只設定於 Supabase，不可提交至 GitHub：

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `GMAIL_SENDER_EMAIL`
- `ISSUE_NOTIFICATION_TO`

## 部署

提交至 `main` 後，由 GitHub Pages 更新前端，Supabase GitHub Integration
則同步資料庫 migrations 與 Edge Functions。
