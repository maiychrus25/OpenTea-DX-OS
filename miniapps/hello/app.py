# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Mini-app mẫu: chào người dùng bằng claim trong access token (spec §8). Chỉ dùng thư viện chuẩn."""
import base64
import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

PREFIX = "/apps/hello"  # every link and form goes back through the web proxy and the gateway
ROLES = ("farmer", "officer", "manager")
PAGE = """<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Xin chào</title>
<link rel="stylesheet" href="/dxos-app.css"></head><body><main>
<h1>Xin chào {name}, HTX {htx}, vai trò {role}</h1>{said}
<form method="post" action="{prefix}/echo"><label>Lời nhắn <input name="message" maxlength="200" required></label>
<button type="submit">Gửi</button></form></main></body></html>"""


def claims(header: str) -> dict | None:
    # No signature check: only APISIX reaches this container, after it verified the token (trust boundary, spec §6.2).
    if not header.startswith("Bearer "):
        return None
    try:
        payload = header.removeprefix("Bearer ").split(".")[1]
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return None
    return data if isinstance(data, dict) else None


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: str = "", headers: dict | None = None) -> None:
        data = body.encode()
        self.send_response(code)
        for key, value in {"Content-Type": "text/html; charset=utf-8", "Content-Length": str(len(data)),
                           "Content-Security-Policy": "script-src 'none'", **(headers or {})}.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/healthz":
            return self.reply(200, "ok")
        if url.path != "/":
            return self.reply(404, "Không có trang này")
        if (user := claims(self.headers.get("Authorization", ""))) is None:
            return self.reply(401, "Cần đăng nhập")
        access = user.get("realm_access")
        roles = access.get("roles") if isinstance(access, dict) else None
        roles = roles if isinstance(roles, list) else []  # an odd claim means no roles, never a crash
        said = parse_qs(url.query).get("said", [""])[0][:200]
        self.reply(200, PAGE.format(
            name=html.escape(str(user.get("name") or user.get("preferred_username") or "")),
            htx=html.escape(str(user.get("htx_code") or "")),
            role=html.escape(", ".join(r for r in ROLES if r in roles)),
            said=f"<p>Bạn vừa nói: {html.escape(said)}</p>" if said else "", prefix=PREFIX))

    def do_POST(self):
        if urlsplit(self.path).path != "/echo":
            return self.reply(404, "Không có trang này")
        if claims(self.headers.get("Authorization", "")) is None:
            return self.reply(401, "Cần đăng nhập")
        length = self.headers.get("Content-Length", "0")
        if not (length.isascii() and length.isdigit()) or int(length) > 4096:  # "²".isdigit() is True
            return self.reply(413, "Dữ liệu quá lớn")
        form = parse_qs(self.rfile.read(int(length)).decode("utf-8", "replace"))
        message = form.get("message", [""])[0][:200]
        self.reply(303, headers={"Location": f"{PREFIX}/?said={quote(message)}"})


if __name__ == "__main__":
    ThreadingHTTPServer(("", 8080), Handler).serve_forever()
