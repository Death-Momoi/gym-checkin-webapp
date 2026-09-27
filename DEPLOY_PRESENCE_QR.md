# v1.5 現場 QR 簽到部署指南

請依照下列順序操作。這一版同時修改資料庫、Edge Function、GitHub Pages
前端，並新增 PC 測試程式；三部分都完成後才進行功能測試。

## 1. 更新 GitHub repository

將壓縮檔內容放進 `gym-checkin-webapp` repository 根目錄後提交到 `main`。
至少應看到以下新檔案：

- `supabase/migrations/20260927000100_create_presence_qr_check_in.sql`
- `supabase/functions/issue-presence-token/index.ts`
- `supabase/functions/issue-presence-token/deno.json`
- `pc_qr_generator/`
- `DEPLOY_PRESENCE_QR.md`

同時會更新 `index.html`、`assets/home.js`、`assets/styles.css`、
`assets/common.js`、`supabase/config.toml` 與 `README.md`。

提交後等待既有 GitHub Action 完成。成功後，到 Supabase **Table Editor**
確認出現：

- `presence_devices`
- `presence_qr_tokens`

> 此 migration 會撤銷舊 `gym_check_in` RPC 的前端權限，避免使用者跳過
> 現場 QR；新版網頁改用 `gym_check_in_with_presence`。

## 2. 設定 Edge Function Secret

Supabase Dashboard → **Edge Functions → Secrets**，新增：

```text
CHECKIN_APP_URL=https://death-momoi.github.io/gym-checkin-webapp/
```

不要自行新增或複製 `SUPABASE_SERVICE_ROLE_KEY` 到程式碼；Supabase 執行環境
會自動提供它。

## 3. 部署 `issue-presence-token`

在 Supabase Dashboard 建立或更新名為 `issue-presence-token` 的 Function：

1. 貼入 `supabase/functions/issue-presence-token/index.ts`。
2. 部署 Function。
3. 關閉 **Verify JWT with legacy secret**／JWT 驗證。裝置使用自己的
   `X-Device-ID` 與 `X-Device-Secret` 驗證，不使用使用者 JWT。

若使用 Supabase CLI，可在 repository 根目錄執行：

```bash
supabase functions deploy issue-presence-token --no-verify-jwt
```

Function URL 應為：

```text
https://rihibyswtlqsyljarerr.supabase.co/functions/v1/issue-presence-token
```

## 4. 設定 PC 測試裝置

Windows：

1. 進入 `pc_qr_generator`。
2. 雙擊 `start_windows.bat`。
3. 接受預設 Function URL 與裝置代碼，或依需求修改。
4. 程式會建立 `config.json` 與 `register_device.sql`。
5. 將 `register_device.sql` 全部貼到 Supabase **SQL Editor** 執行一次。
6. 再次雙擊 `start_windows.bat`。

`config.json` 是現場裝置密碼，已被 `.gitignore` 排除。請勿上傳 GitHub、
貼進對話或傳給其他人。

## 5. 測試清單

| 情境 | 預期結果 |
|---|---|
| 未掃 QR 直接開首頁 | 可登入與瀏覽；「驗證並簽到」停用 |
| PC 按「模擬揮手」 | 顯示 240 × 240 QR 與 60 秒倒數 |
| 有效期內多人掃同一 QR | 每人都可各自登入並簽到 |
| QR 超過 60 秒後再掃 | 仍進入首頁，但顯示過期且不能簽到 |
| 已簽到者直接開首頁 | 不需 QR，可以簽退 |
| 已簽到者掃有效或過期 QR | 仍可正常簽退 |
| 把網址 Token 改掉 | 顯示無效，不能簽到 |

測試成功後，可在 `presence_qr_tokens` 看到 Token 的雜湊與到期時間；資料庫
不會保存可直接使用的原始 Token。

## 6. 緊急停用或回復

裝置遺失時，在 `presence_devices` 將該裝置的 `enabled` 改成 `false`，之後
它無法再取得 Token，已簽發但尚未過期的 Token 也會立即失效。

若部署中必須暫時恢復舊版免 QR 簽到，可在 SQL Editor 執行：

```sql
grant execute on function public.gym_check_in(text) to authenticated;
```

這只應作為短暫回復措施；恢復後會失去防止遠端代簽的保護。
