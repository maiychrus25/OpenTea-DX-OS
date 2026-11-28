# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Stub ZNS API for the platform smoke test (compose profile zalo-test only). Records calls and serves injected failures."""
import json
import os
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .zns_api import ERROR_CODES


class StubState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.calls: list[dict[str, Any]] = []
        self.failures: list[int] = []  # codes still to serve, oldest first
        self.counter = 0

    def reset(self) -> None:
        with self.lock:
            self.calls.clear()
            self.failures.clear()


def make_handler(state: StubState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:  # keep the smoke log quiet
            return

        def _raw(self) -> str:
            return self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode("utf-8")

        def _send(self, status: int, payload: Any) -> None:
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path == "/control/calls":
                with state.lock:
                    return self._send(200, list(state.calls))
            self._send(404, {"error": -1, "message": "Not Found"})

        def do_POST(self) -> None:
            raw = self._raw()
            if self.path == "/control/reset":
                state.reset()
                return self._send(200, {"ok": True})
            if self.path == "/control/fail-next":
                spec = json.loads(raw or "{}")
                with state.lock:
                    state.failures.extend([int(spec["code"])] * int(spec.get("times", 1)))
                return self._send(200, {"ok": True})
            if self.path == "/message/template":
                return self._template(json.loads(raw or "{}"))
            if self.path == "/oa/access_token":
                return self._refresh(raw)
            self._send(404, {"error": -1, "message": "Not Found"})

        def _record(self, body: Any, **extra: Any) -> None:
            with state.lock:
                state.calls.append({"path": self.path, "body": body, **extra})

        def _template(self, body: dict[str, Any]) -> None:
            token = self.headers.get("access_token", "")
            self._record(body, access_token=token)
            if not token:
                return self._send(200, {"error": -216, "message": "access_token header is required"})
            with state.lock:
                code = state.failures.pop(0) if state.failures else 0
                state.counter += 1
                msg_id = f"stub-msg-{state.counter}"
            if code >= 500:
                return self._send(code, {"error": code, "message": "stub server error"})
            if code:
                known = ERROR_CODES.get(code)
                return self._send(200, {"error": code, "message": known.description if known else "stub error"})
            self._send(200, {"error": 0, "message": "Success", "data": {"msg_id": msg_id, "sent_time": "stub"}})

        def _refresh(self, raw: str) -> None:
            form = {key: values[0] for key, values in urllib.parse.parse_qs(raw).items()}
            self._record(form, secret_key=self.headers.get("secret_key", ""))
            with state.lock:
                state.counter += 1
                n = state.counter
            # Zalo returns expires_in as a string.
            self._send(200, {"access_token": f"stub-access-{n}", "refresh_token": f"stub-refresh-{n}", "expires_in": "90000"})

    return Handler


def main() -> None:
    port = int(os.environ.get("DXOS_ZALO_STUB_PORT", "8084"))
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(StubState())).serve_forever()


if __name__ == "__main__":
    main()
