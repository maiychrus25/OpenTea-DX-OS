# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Test-only stand-in for the Anthropic Messages and OpenAI Chat Completions APIs (standard library only).

It answers both request shapes and records every request, so the agentic smoke can check what left the server. For each
rejected entry in the user message it returns a reason naming the parcel, which is what journal-review accepts. Use it
with fake keys only: the recorded headers are kept in memory for the smoke to read.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ANTHROPIC_PATH = "/v1/messages"
OPENAI_PATH = "/v1/chat/completions"
USAGE_IN = 123
USAGE_OUT = 45
MAX_RECORDED_CALLS = 200

_lock = threading.Lock()
_calls: list[dict] = []


def _user_payload(messages):
    """The JSON object the agent puts in its last user message."""
    for msg in reversed(messages):
        if msg.get("role") == "user" and isinstance(msg.get("content"), str):
            try:
                payload = json.loads(msg["content"])
            except json.JSONDecodeError:
                return {}
            return payload if isinstance(payload, dict) else {}
    return {}


def _reply_text(messages):
    reasons = {}
    for item in _user_payload(messages).get("rejected") or []:
        reasons[str(item.get("entry_id", ""))] = f"Nhật ký thửa {item.get('parcel_code', '')} cần kiểm tra lại trước khi duyệt."
    return json.dumps({"reject_reasons": reasons}, ensure_ascii=False)


def _anthropic_answer(body):
    text = _reply_text(body.get("messages") or [])
    return {
        "id": "msg_stub",
        "type": "message",
        "role": "assistant",
        "model": body.get("model", ""),
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": USAGE_IN, "output_tokens": USAGE_OUT},
    }


def _openai_answer(body):
    text = _reply_text(body.get("messages") or [])
    return {
        "id": "chatcmpl-stub",
        "object": "chat.completion",
        "model": body.get("model", ""),
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": USAGE_IN, "completion_tokens": USAGE_OUT},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "dxos-llm-stub"

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
        if self.path == "/healthz":
            self._send(200, {"ok": True})
        elif self.path == "/control/calls":
            with _lock:
                self._send(200, {"calls": list(_calls)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if self.path == "/control/reset":
            with _lock:
                _calls.clear()
            self._send(200, {"ok": True})
            return
        if self.path not in (ANTHROPIC_PATH, OPENAI_PATH):
            self._send(404, {"error": "not found"})
            return
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid json"})
            return
        if not isinstance(body, dict):
            self._send(400, {"error": "body must be an object"})
            return
        record = {
            "path": self.path,
            "x-api-key": self.headers.get("x-api-key"),
            "anthropic-version": self.headers.get("anthropic-version"),
            "authorization": self.headers.get("Authorization"),
            "body": body,
        }
        with _lock:
            _calls.append(record)
            del _calls[:-MAX_RECORDED_CALLS]
        answer = _anthropic_answer(body) if self.path == ANTHROPIC_PATH else _openai_answer(body)
        self._send(200, answer)


def make_server(port, host="0.0.0.0"):
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    make_server(int(os.environ.get("DXOS_LLM_STUB_PORT", "8082"))).serve_forever()
