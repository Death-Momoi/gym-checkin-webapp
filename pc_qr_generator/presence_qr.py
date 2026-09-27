"""PC test display for the 240 x 240 on-site check-in QR flow."""

from __future__ import annotations

import argparse
import json
import queue
import ssl
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from tkinter import BOTH, BOTTOM, DISABLED, NORMAL, X, Button, Label, Tk, messagebox

import qrcode
from PIL import Image, ImageTk
from qrcode.constants import ERROR_CORRECT_L


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
LAST_QR_PATH = ROOT / "last_qr_240.png"


def load_config(path: Path = CONFIG_PATH) -> dict:
    if not path.exists():
        raise RuntimeError("找不到 config.json，請先執行 setup_device.py。")

    config = json.loads(path.read_text(encoding="utf-8"))
    required = ("function_url", "device_id", "device_secret")
    missing = [name for name in required if not str(config.get(name, "")).strip()]
    if missing:
        raise RuntimeError(f"config.json 缺少欄位：{', '.join(missing)}")
    return config


def request_qr_payload(config: dict, timeout: int = 15) -> dict:
    request = urllib.request.Request(
        str(config["function_url"]),
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "X-Device-ID": str(config["device_id"]),
            "X-Device-Secret": str(config["device_secret"]),
            "User-Agent": "gym-checkin-pc-qr/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=ssl.create_default_context(),
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            detail = payload.get("error")
        except (UnicodeDecodeError, json.JSONDecodeError):
            detail = None
        raise RuntimeError(detail or f"Edge Function 回傳 HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"無法連線到 Supabase：{error.reason}") from error

    if not payload.get("ok") or not payload.get("check_in_url"):
        raise RuntimeError(payload.get("error") or "伺服器沒有回傳簽到網址")
    return payload


def render_qr(url: str, size: int = 240) -> tuple[Image.Image, int, int]:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_L,
        box_size=1,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    matrix_width = len(qr.get_matrix())
    pixels_per_module = size // matrix_width
    if pixels_per_module < 3:
        raise RuntimeError("簽到網址太長，無法在 240×240 畫面清楚顯示。")

    rendered = qr.make_image(
        fill_color="black",
        back_color="white",
    ).convert("RGB")
    rendered = rendered.resize(
        (matrix_width * pixels_per_module, matrix_width * pixels_per_module),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGB", (size, size), "white")
    offset = ((size - rendered.width) // 2, (size - rendered.height) // 2)
    canvas.paste(rendered, offset)
    return canvas, matrix_width, pixels_per_module


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


class PresenceQrApp:
    def __init__(self, root: Tk, config: dict) -> None:
        self.root = root
        self.config = config
        self.result_queue: queue.Queue = queue.Queue()
        self.expires_at: datetime | None = None
        self.photo: ImageTk.PhotoImage | None = ImageTk.PhotoImage(
            Image.new("RGB", (240, 240), "#111827")
        )
        self.loading = False

        root.title("現場簽到 QR｜PC 測試器")
        root.configure(bg="#0f172a")
        root.resizable(False, False)
        root.bind("<space>", lambda _event: self.issue_qr())
        root.bind("<Return>", lambda _event: self.issue_qr())

        self.title = Label(
            root,
            text="在超音波感測器前揮手",
            fg="#f8fafc",
            bg="#0f172a",
            font=("Arial", 16, "bold"),
            pady=12,
        )
        self.title.pack(fill=X)

        self.qr_label = Label(
            root,
            image=self.photo,
            compound="center",
            width=240,
            height=240,
            text="按下方按鈕或空白鍵\n模擬揮手",
            fg="#cbd5e1",
            bg="#111827",
            font=("Arial", 13),
        )
        self.qr_label.pack(padx=18, pady=4)

        self.status = Label(
            root,
            text="QR Code 尚未產生",
            fg="#94a3b8",
            bg="#0f172a",
            font=("Arial", 11),
            pady=10,
        )
        self.status.pack(fill=X)

        self.button = Button(
            root,
            text="模擬揮手／產生新 QR Code",
            command=self.issue_qr,
            bg="#22c55e",
            fg="#052e16",
            activebackground="#86efac",
            font=("Arial", 12, "bold"),
            padx=12,
            pady=9,
        )
        self.button.pack(fill=BOTH, side=BOTTOM, padx=18, pady=(0, 16))

        self.root.after(100, self.poll_result)
        self.root.after(250, self.update_countdown)

    def issue_qr(self) -> None:
        if self.loading:
            return
        self.loading = True
        self.button.configure(state=DISABLED)
        self.status.configure(text="正在向 Supabase 取得 60 秒認證碼……", fg="#7dd3fc")
        threading.Thread(target=self.fetch_in_background, daemon=True).start()

    def fetch_in_background(self) -> None:
        try:
            payload = request_qr_payload(self.config)
            size = int(self.config.get("display_size", 240))
            image, modules, pixels = render_qr(payload["check_in_url"], size)
            image.save(LAST_QR_PATH)
            self.result_queue.put(("ok", payload, image, modules, pixels))
        except Exception as error:  # noqa: BLE001 - displayed to the operator
            self.result_queue.put(("error", str(error)))

    def poll_result(self) -> None:
        try:
            result = self.result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, self.poll_result)
            return

        self.loading = False
        self.button.configure(state=NORMAL)

        if result[0] == "error":
            self.status.configure(text="產生失敗", fg="#fca5a5")
            messagebox.showerror("無法產生 QR Code", result[1])
        else:
            _, payload, image, modules, pixels = result
            self.photo = ImageTk.PhotoImage(image)
            self.qr_label.configure(image=self.photo, text="", width=image.width, height=image.height)
            self.expires_at = parse_timestamp(payload["expires_at"])
            self.status.configure(
                text=f"認證有效｜{modules} 模組｜每模組 {pixels}px",
                fg="#86efac",
            )

        self.root.after(100, self.poll_result)

    def update_countdown(self) -> None:
        if self.expires_at and not self.loading:
            remaining = int(
                (self.expires_at - datetime.now(timezone.utc)).total_seconds()
            )
            if remaining >= 0:
                self.status.configure(
                    text=f"可重複掃描｜剩餘 {remaining} 秒",
                    fg="#86efac" if remaining > 10 else "#fde68a",
                )
            else:
                self.status.configure(
                    text="已過期｜仍可開啟網頁，但不能簽到",
                    fg="#fca5a5",
                )
                self.expires_at = None
        self.root.after(250, self.update_countdown)


def save_once(config: dict) -> None:
    payload = request_qr_payload(config)
    size = int(config.get("display_size", 240))
    image, modules, pixels = render_qr(payload["check_in_url"], size)
    image.save(LAST_QR_PATH)
    print(f"已建立：{LAST_QR_PATH}")
    print(f"有效期限：{payload['expires_at']}")
    print(f"QR：{modules} 模組，每模組 {pixels}px，輸出 {size}×{size}px")


def main() -> None:
    parser = argparse.ArgumentParser(description="現場簽到 QR PC 測試器")
    parser.add_argument(
        "--save-only",
        action="store_true",
        help="不開啟視窗，只產生 last_qr_240.png",
    )
    args = parser.parse_args()

    try:
        config = load_config()
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from error

    if args.save_only:
        save_once(config)
        return

    root = Tk()
    PresenceQrApp(root, config)
    root.mainloop()


if __name__ == "__main__":
    main()
