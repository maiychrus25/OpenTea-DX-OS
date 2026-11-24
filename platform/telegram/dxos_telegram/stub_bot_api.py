# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Stub Telegram Bot API for the platform smoke test (compose profile telegram-test only). Records calls and queues injected updates."""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class StubState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.updates: list[dict[str, Any]] = []
        self.calls: list[dict[str, Any]] = []
        self.message_id = 1000

    def next_message(self, chat_id: Any, text: Any) -> dict[str, Any]:
        with self.lock:
            self.message_id += 1
            return {"message_id": self.message_id, "chat": {"id": chat_id}, "text": text}

    def pending(self, offset: int) -> list[dict[str, Any]]:
        with self.lock:
            return [update for update in self.updates if update["update_id"] >= offset]


def make_handler(state: StubState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:  # keep the smoke log quiet
            return

        def _body(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            return json.loads(raw.decode("utf-8") or "{}")

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
                    self._send(200, list(state.calls))
            else:
                self._send(404, {"ok": False})

        def do_POST(self) -> None:
            if self.path.startswith("/control/"):
                return self._control()
            method = self.path.rsplit("/", 1)[-1]
            params = self._body()
            if method == "getUpdates":
                return self._get_updates(params)
            with state.lock:
                state.calls.append({"method": method, "params": params})
            if method == "sendMessage":
                result: Any = state.next_message(params.get("chat_id"), params.get("text"))
            elif method == "editMessageText":
                result = {"message_id": params.get("message_id"), "chat": {"id": params.get("chat_id")}}
            elif method == "answerCallbackQuery":
                result = True
            else:
                return self._send(404, {"ok": False, "error_code": 404, "description": "Not Found"})
            self._send(200, {"ok": True, "result": result})

        def _get_updates(self, params: dict[str, Any]) -> None:
            deadline = time.monotonic() + min(float(params.get("timeout") or 0), 30.0)
            pending = state.pending(int(params.get("offset") or 0))
            while not pending and time.monotonic() < deadline:
                time.sleep(0.2)
                pending = state.pending(int(params.get("offset") or 0))
            self._send(200, {"ok": True, "result": pending})

        def _control(self) -> None:
            if self.path == "/control/updates":
                with state.lock:
                    state.updates.append(self._body())
                return self._send(200, {"ok": True})
            if self.path == "/control/reset":
                with state.lock:
                    state.updates.clear()
                    state.calls.clear()
                return self._send(200, {"ok": True})
            self._send(404, {"ok": False})

    return Handler


def main() -> None:
    port = int(os.environ.get("DXOS_TELEGRAM_STUB_PORT", "8081"))
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(StubState()))
    server.serve_forever()


if __name__ == "__main__":
    main()
