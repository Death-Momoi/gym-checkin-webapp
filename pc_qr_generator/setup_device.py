"""Create local credentials and the one-time SQL for an on-site QR device."""

from __future__ import annotations

import getpass
import hashlib
import json
import re
import secrets
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
SQL_PATH = ROOT / "register_device.sql"
DEFAULT_FUNCTION_URL = (
    "https://rihibyswtlqsyljarerr.supabase.co/functions/v1/"
    "issue-presence-token"
)
DEVICE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")


def prompt(label: str, default: str) -> str:
    value = input(f"{label} [{default}]: ").strip()
    return value or default


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_registration_sql(
    device_id: str,
    display_name: str,
    secret_hash: str,
) -> str:
    return f"""-- Paste this file into Supabase Dashboard > SQL Editor and run it once.
insert into public.presence_devices (
  device_code,
  display_name,
  secret_hash,
  enabled
)
values (
  {sql_literal(device_id)},
  {sql_literal(display_name)},
  {sql_literal(secret_hash)},
  true
)
on conflict (device_code) do update
set
  display_name = excluded.display_name,
  secret_hash = excluded.secret_hash,
  enabled = true,
  updated_at = now();
"""


def main() -> None:
    print("運動科學實驗室｜現場 QR 裝置設定")
    print("這個步驟只會在本機建立裝置密碼與註冊 SQL。\n")

    function_url = prompt("Edge Function URL", DEFAULT_FUNCTION_URL)
    device_id = prompt("裝置代碼", "lab-entrance-01").lower()
    if not DEVICE_PATTERN.fullmatch(device_id):
        raise SystemExit(
            "裝置代碼需為 3–64 個小寫英數字、底線或連字號，且須以英數字開頭。"
        )

    display_name = prompt("裝置名稱", "實驗室入口測試電腦")
    if not 1 <= len(display_name) <= 80:
        raise SystemExit("裝置名稱需為 1–80 個字元。")

    if CONFIG_PATH.exists():
        confirmation = input(
            "config.json 已存在。輸入 REPLACE 才會更換裝置密碼： "
        ).strip()
        if confirmation != "REPLACE":
            raise SystemExit("已取消，原有裝置密碼未變更。")

    device_secret = secrets.token_urlsafe(32)
    secret_hash = hashlib.sha256(device_secret.encode("utf-8")).hexdigest()
    config = {
        "function_url": function_url,
        "device_id": device_id,
        "device_secret": device_secret,
        "display_size": 240,
    }

    CONFIG_PATH.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    SQL_PATH.write_text(
        build_registration_sql(device_id, display_name, secret_hash),
        encoding="utf-8",
    )

    print("\n已建立：")
    print(f"  {CONFIG_PATH.name}（請勿上傳 GitHub 或傳給他人）")
    print(f"  {SQL_PATH.name}（下一步貼到 Supabase SQL Editor 執行）")
    print("\n完成 SQL 後，執行：python presence_qr.py")
    getpass.getpass("按 Enter 關閉……")


if __name__ == "__main__":
    main()

