# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Stub Telegram Bot API for the platform smoke test (compose profile telegram-test only). Records calls and queues injected updates."""
import base64
import json
import os
from email.parser import BytesParser
from email.policy import HTTP
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

# A 16x16 JPEG (632 bytes) served for every photo: the smoke only checks that the bytes arrive and are stored.
PHOTO_PATH = "photos/smoke.jpg"
PHOTO_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDJooorhPMP/9k="
)

# A tiny OGG-shaped blob served for every voice message: the smoke's stub speech-to-text answers the same text for any audio.
VOICE_PATH = "voice/smoke.oga"
VOICE_OGG = b"OggS\x00\x02" + bytes(range(64))


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

        def _multipart(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
            """Text fields (JSON values decoded) and the uploaded parts' names and sizes, for sendMediaGroup and sendPhoto."""
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + raw)
            params: dict[str, Any] = {}
            files: list[dict[str, Any]] = []
            for part in message.iter_parts():
                payload = part.get_payload(decode=True) or b""
                if part.get_filename():
                    files.append({"name": part.get_param("name", header="content-disposition"), "filename": part.get_filename(), "size": len(payload)})
                else:
                    text = payload.decode("utf-8")
                    try:
                        params[part.get_param("name", header="content-disposition")] = json.loads(text)
                    except ValueError:
                        params[part.get_param("name", header="content-disposition")] = text
            return params, files

        def _send_bytes(self, data: bytes, content_type: str) -> None:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

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
            elif self.path.startswith("/file/bot") and self.path.endswith("/" + VOICE_PATH):
                self._send_bytes(VOICE_OGG, "audio/ogg")
            elif self.path.startswith("/file/bot") and self.path.endswith("/" + PHOTO_PATH):
                self._send_bytes(PHOTO_JPEG, "image/jpeg")
            else:
                self._send(404, {"ok": False})

        def do_POST(self) -> None:
            if self.path.startswith("/control/"):
                return self._control()
            method = self.path.rsplit("/", 1)[-1]
            if method in ("sendMediaGroup", "sendPhoto"):
                return self._upload(method)
            params = self._body()
            if method == "getUpdates":
                return self._get_updates(params)
            with state.lock:
                state.calls.append({"method": method, "params": params})
            if method == "sendMessage":
                result: Any = state.next_message(params.get("chat_id"), params.get("text"))
            elif method == "editMessageText":
                result = {"message_id": params.get("message_id"), "chat": {"id": params.get("chat_id")}}
            elif method in ("answerCallbackQuery", "setChatMenuButton"):
                result = True
            elif method == "getFile" and str(params.get("file_id", "")).startswith("smoke-voice"):
                result = {"file_id": params.get("file_id"), "file_unique_id": "smoke-voice", "file_size": len(VOICE_OGG), "file_path": VOICE_PATH}
            elif method == "getFile":
                result = {"file_id": params.get("file_id"), "file_unique_id": "smoke-stub", "file_size": len(PHOTO_JPEG), "file_path": PHOTO_PATH}
            else:
                return self._send(404, {"ok": False, "error_code": 404, "description": "Not Found"})
            self._send(200, {"ok": True, "result": result})

        def _upload(self, method: str) -> None:
            params, files = self._multipart()
            with state.lock:
                state.calls.append({"method": method, "params": params, "files": files})
            sent = [state.next_message(params.get("chat_id"), params.get("caption")) for _ in (files if method == "sendMediaGroup" else files[:1])]
            self._send(200, {"ok": True, "result": sent if method == "sendMediaGroup" else sent[0]})

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
