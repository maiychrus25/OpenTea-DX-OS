# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Test-only stand-in for the disease API (standard library only): answers one fixed tea result for any photo.

It records what it was sent (the path, the model, whether a bearer token and a multipart JPEG came, never the photo or the
token), so the assistant smoke can check that a photo sent in chat reached the API through the internal gateway route.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

LABEL = "Phồng lá chè"
CONFIDENCE = 0.91
MAX_RECORDED = 100

_lock = threading.Lock()
_requests: list[dict] = []


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-disease-stub"

    def log_message(self, fmt, *args):
        return

    def _send(self, status, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/control/requests":
            with _lock:
                return self._send(200, {"requests": list(_requests)})
        self._send(200, {"status": "ok"})  # /health of the real API

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        url = urlparse(self.path)
        if url.path == "/control/reset":
            with _lock:
                _requests.clear()
            return self._send(200, {"ok": True})
        if url.path != "/predict":
            return self._send(404, {"error": "not found"})
        with _lock:
            _requests.append({
                "path": url.path,
                "model": (parse_qs(url.query).get("model") or [""])[0],
                "bearer": (self.headers.get("Authorization") or "").startswith("Bearer "),
                "multipart": "multipart/form-data" in (self.headers.get("Content-Type") or ""),
                "jpeg": b"\xff\xd8\xff" in raw,
            })
            del _requests[:-MAX_RECORDED]
        self._send(200, {"disease_name_vi": LABEL, "confidence": CONFIDENCE, "uncertain": False})


def make_server(port, host="0.0.0.0"):
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    make_server(int(os.environ.get("DXOS_DISEASE_STUB_PORT", "8000"))).serve_forever()
