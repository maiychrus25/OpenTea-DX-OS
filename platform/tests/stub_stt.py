# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Test-only stand-in for the whisper.cpp server (standard library only): answers the same fixed text for any audio.

It records what it was sent (size and whether the bytes look like OGG, never the audio itself), so the voice smoke can check
that the relay posted exactly the voice file and nothing else. The real server is too heavy for CI.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TEXT = "Ghi nhật ký bón phân thửa A3"
MAX_RECORDED = 100

_lock = threading.Lock()
_requests: list[dict] = []


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-stt-stub"

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
                self._send(200, {"requests": list(_requests)})
        else:
            self._send(200, {"ok": True})  # the compose healthcheck of the real server answers on /

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if self.path == "/control/reset":
            with _lock:
                _requests.clear()
            return self._send(200, {"ok": True})
        if self.path != "/inference":
            return self._send(404, {"error": "not found"})
        with _lock:
            _requests.append({"bytes": len(raw), "ogg": b"OggS" in raw, "multipart": "multipart/form-data" in (self.headers.get("Content-Type") or "")})
            del _requests[:-MAX_RECORDED]
        self._send(200, {"text": f" {TEXT} "})


def make_server(port, host="0.0.0.0"):
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    make_server(int(os.environ.get("DXOS_STT_STUB_PORT", "8083"))).serve_forever()
