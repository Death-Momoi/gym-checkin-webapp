# Supabase 設定教學

你恢復的是原本專案，因此優先沿用原本資料表、Google 登入設定和 QR 裝置認證。下列路徑都相對於更新包中的 `web-update`，或將更新檔覆蓋到專案後的根目錄。

## 1. 新增環境資料表

Supabase Dashboard → SQL Editor → 新查詢，貼入以下檔案全部內容並執行 **一次**：

`supabase/migrations/20261122000100_environment_latest.sql`

成功後 Table Editor 會看到 `environment_latest`。每台 ESP32 只保留最新一筆，不持續累積歷史資料。
前提是專案已有原本的 `profiles`、`presence_devices`。如果出現「relation does not exist」，先確認是否選到原本專案；不要為了此更新重新執行所有舊 migrations。

## 2. 部署新的接收 Function

Supabase → Edge Functions → 建立 Function，名稱填 **`ingest-environment`**。

最簡單的 Dashboard 貼上方式：

1. 用文字編輯器開啟 `setup/ingest-environment.dashboard.ts`。
2. 把內容完整貼入 Function 的 `index.ts`，取代範例程式，部署。
3. 在這支 Function 的設定關閉 **Verify JWT with legacy secret**／JWT 驗證。本程式自行驗證 `X-Device-ID`、`X-Device-Secret`；請保留程式中的認證檢查。

該檔由正式 `index.ts` + `handler.ts` 合併產生，與 CLI 版本邏輯相同。只需部署其中一種。

原本 **`issue-presence-token`** Function 維持原樣；若它尚未部署，請照你原本的 `DEPLOY_PRESENCE_QR.md` 部署。它的 `CHECKIN_APP_URL` 應為：

`https://death-momoi.github.io/gym-checkin-webapp/`

新的環境 Function 不需要 Google Secrets。Supabase 執行環境會提供伺服器用的 Supabase URL 與 service-role/secret key，不需要把這把金鑰填入原始碼或 ESP32。

## 3. 確認裝置認證

如果你保留原本 `.ino` 或 PC QR 工具的 `config.json`，把其中 device ID、device secret 填入新 `FirmwareConfig.h` 即可。資料庫 `presence_devices` 的該裝置需為 enabled。

**如果真的忘記原本裝置 secret**：

1. 開啟 `setup/register_environment_device.example.sql`。
2. 填寫 `wanted_code`（3～64 字元，小寫英文、數字、底線、連字號；開頭英數）和 `wanted_secret`（自己產生至少 32 字元的隨機密碼）。
3. 在 SQL Editor 執行。
4. 把完全相同的兩個值填進 ESP32。

這份 SQL 只儲存 SHA-256 hash；如果使用已存在的裝置 ID，會更新該裝置密碼，原本同 ID 的其他 QR 程式也要一起更新密碼。

## 4. 填網站設定

編輯 `assets/core/config.js`：

```javascript
export const SUPABASE_URL = 'https://你的專案代碼.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = '你的 publishable key';
export const REDIRECT_URL = 'https://death-momoi.github.io/gym-checkin-webapp/';
export const RETURN_TO_KEY = 'gym-checkin-return-to';
```

URL 與金鑰可從 Supabase 專案 Connect／API Keys 設定取得。此欄使用 publishable key 或原本的 anon key，**不要使用 service_role 或 sb_secret 金鑰**。如果原本的 `assets/core/config.js` 已能正常連線同一專案，可保留原檔。

網站登入沿用原本 Google OAuth。已登入且 active 的使用者可讀取環境資料，瀏覽器無權直接寫入。

## 5. 上傳網站更新

將 `web-update` 裡的檔案按相同路徑覆蓋到 GitHub 專案根目錄，提交後等待 GitHub Pages 完成更新，再登入網站開啟「環境感測數據」。新增檔案清單見 `UPDATE_FILE_LIST.txt`。

**把 SQL／Function 原始碼上傳 GitHub，不等於已部署到 Supabase。** 這次查看的公開 repository 沒有資料庫自動部署 workflow，請完成前兩步。

## CLI 替代方式

已使用 Supabase CLI 管理 migration 的話，在專案根目錄執行：

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy ingest-environment --no-verify-jwt
```

SQL Editor 與 CLI 選一種方式建立新資料表。如果先手動跑 SQL，日後改用 CLI，需同步 migration history，避免重複建立資料表。CLI 會部署 `supabase/functions/ingest-environment/`，不需使用單檔 Dashboard 版本。

## 驗證與故障排除

| 現象 | 檢查 |
|---|---|
| Serial `[UPLOAD] OK` | Table Editor 的 environment_latest 應出現對應裝置資料 |
| HTTP 401 | DEVICE_ID／DEVICE_SECRET、裝置 enabled、該 Function 的 JWT 開關 |
| HTTP 404 | Supabase URL、Function 名稱與部署是否成功 |
| HTTP 500 | Function Logs、新資料表是否已建立、伺服器 key 是否正常 |
| Wi-Fi／NTP failed | 2.4GHz Wi-Fi、網路／DNS／NTP；下個週期會重試 |
| 網頁「讀取失敗」 | core/config.js、Google 登入、資料表與 RLS 設定 |
| 網頁「等待第一筆」 | 看 Serial 是否上傳成功、ESP32 與網頁是否使用同一個專案 |
| 網頁「部分感測異常」 | 檢查顯示「—」的感測器；其他欄位仍可正常更新 |
| 網頁「暫未更新」 | 超過 150 秒沒有新樣本；顯示為上次收到的資料 |

官方參考：[Function 部署](https://supabase.com/docs/guides/functions/deploy)、[Function 環境變數](https://supabase.com/docs/guides/functions/secrets)。
