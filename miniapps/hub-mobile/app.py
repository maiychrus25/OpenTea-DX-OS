# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app: trang tải và cài app OpenTea (hub-mobile) trên điện thoại. Chỉ dùng thư viện chuẩn, không lưu dữ liệu."""
import html
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

# Where the Android APK and the web build live. Set by the operator in the container environment; the defaults point
# at the repository's releases page. Only http(s) links are accepted, anything else falls back to the default.
DEFAULT_APK = "https://github.com/maiychrus25/OpenTea-DX-OS/releases/latest"
THEMES = ("light", "dark")
HTX = re.compile(r"^[A-Za-z0-9_-]{1,20}$")
PAGE = """<!doctype html><html lang="vi"{theme_attr}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>OpenTea trên điện thoại</title>
<link rel="stylesheet" href="/dxos-app.css"></head><body><main>
<h1>OpenTea trên điện thoại</h1>
<p>Một app cho khách du lịch, người mua, nông dân, trưởng HTX, cán bộ HTX và hướng dẫn viên. Đăng nhập là thấy đúng phần việc của bạn.</p>
<h2>Android</h2>
<ol><li><a href="{apk}" rel="noopener">Tải app cho Android (APK)</a></li>
<li>Mở tệp vừa tải. Nếu máy hỏi, cho phép cài từ nguồn này.</li></ol>
<h2>iPhone</h2>{iphone}
<p class="notice">Chỉ tải app từ đường dẫn do HTX của bạn gửi.</p></main></body></html>"""


def link(name: str) -> str:
    value = os.environ.get(name, "").strip()
    return value if urlsplit(value).scheme in ("http", "https") and urlsplit(value).netloc else ""


def render(theme: str) -> str:
    web = link("HUB_WEB_URL")
    iphone = ('<ol><li>Mở <a href="%s" rel="noopener">bản web của app</a> bằng Safari.</li>'
              "<li>Bấm nút Chia sẻ, chọn Thêm vào Màn hình chính.</li></ol>" % html.escape(web, quote=True)
              if web else "<p>Bản cho iPhone chưa sẵn sàng. HTX sẽ gửi đường dẫn khi có.</p>")
    return PAGE.format(apk=html.escape(link("HUB_APK_URL") or DEFAULT_APK, quote=True), iphone=iphone,
                       theme_attr=f' data-theme="{theme}"' if theme in THEMES else "")


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: str = "") -> None:
        data = body.encode()
        self.send_response(code)
        for key, value in {"Content-Type": "text/html; charset=utf-8", "Content-Length": str(len(data)),
                           "Content-Security-Policy": "script-src 'none'"}.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlsplit(self.path)
        parts = [p for p in url.path.split("/") if p]
        theme = next((v.split("=", 1)[1] for v in url.query.split("&") if v.startswith("theme=")), "")
        if url.path == "/healthz":
            return self.reply(200, "ok")
        # "/" is the signed-in page (the gateway checked the token); "/public/<HTX>" is the open page.
        if not parts or (parts[0] == "public" and len(parts) == 2 and HTX.match(parts[1])):
            return self.reply(200, render(theme))
        self.reply(404, "Không có trang này")


if __name__ == "__main__":
    ThreadingHTTPServer(("", 8080), Handler).serve_forever()
