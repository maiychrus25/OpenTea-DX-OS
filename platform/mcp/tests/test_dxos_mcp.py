# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Tests for the MCP stdio bridge, against a loopback fake of Keycloak and the web's MCP routes."""
import io
import json
import os
import stat
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dxos_mcp  # noqa: E402

REALM_PATH = "/auth/realms/agrimarket"
DEVICE_PATH = REALM_PATH + "/protocol/openid-connect/auth/device"
TOKEN_ENDPOINT = REALM_PATH + "/protocol/openid-connect/token"
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
TOOLS = [
    {
        "name": "list_lots",
        "title_vi": "Danh sách lô",
        "description_vi": "Liệt kê lô của HTX.",
        "input_schema": {"type": "object", "properties": {}},
    }
]


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        fake = self.server.fake
        fake.calls.append(("GET", self.path, self.headers.get("Authorization")))
        if not fake.authorized(self.headers):
            return self._send(401, {"message_vi": "Phiên không hợp lệ."})
        if self.path == "/api/mcp/tools":
            return self._send(200, {"tools": TOOLS})
        self._send(404, {})

    def do_POST(self):
        fake = self.server.fake
        path = urllib.parse.urlsplit(self.path).path
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if path == DEVICE_PATH:
            return self._send(*fake.device_grant())
        if path == TOKEN_ENDPOINT:
            return self._send(*fake.token(dict(urllib.parse.parse_qsl(raw.decode("utf-8")))))
        fake.calls.append(("POST", path, self.headers.get("Authorization")))
        if not fake.authorized(self.headers):
            return self._send(401, {"message_vi": "Phiên không hợp lệ."})
        if path.startswith("/api/mcp/tools/"):
            return self._send(*fake.tool(path.rsplit("/", 1)[1], json.loads(raw or b"{}")))
        self._send(404, {})

    def _send(self, status, body):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class FakeDxos:
    """Keycloak and the web's MCP routes on one loopback port."""

    def __init__(self):
        self.polls = ["authorization_pending", "slow_down", "approved"]
        self.access = "acc-1"
        self.refresh = "ref-1"
        self.calls = []
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.httpd.fake = self
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()

    def authorized(self, headers):
        return headers.get("Authorization") == f"Bearer {self.access}"

    def device_grant(self):
        return 200, {
            "device_code": "device-secret",
            "user_code": "ABCD-EFGH",
            "verification_uri": self.base + "/device",
            "verification_uri_complete": self.base + "/device?user_code=ABCD-EFGH",
            "expires_in": 600,
            "interval": 0,
        }

    def token(self, form):
        if form.get("grant_type") == DEVICE_GRANT:
            step = self.polls.pop(0)
            if step == "approved":
                return 200, self._tokens()
            return 400, {"error": step}
        if form.get("grant_type") == "refresh_token" and form.get("refresh_token") == self.refresh:
            self.access, self.refresh = "acc-2", "ref-2"
            return 200, self._tokens()
        return 400, {"error": "invalid_grant"}

    def _tokens(self):
        return {"access_token": self.access, "refresh_token": self.refresh, "expires_in": 300}

    def tool(self, name, body):
        if name == "list_lots":
            return 200, {"text": "Lô LT-1 đang trồng\nNguồn: lots"}
        if name == "create_proposal":
            return 201, {
                "proposal_id": "p-1",
                "status": "proposed",
                "message_vi": "Đã tạo đề xuất. Bạn cần xác nhận trên web hoặc Telegram.",
            }
        return 403, {"message_vi": "Bạn không có quyền dùng công cụ này."}


@pytest.fixture
def fake():
    server = FakeDxos()
    yield server
    server.close()


@pytest.fixture
def token_path(tmp_path):
    return tmp_path / "dxos-mcp" / "token.json"


def write_token(path, base, expires_in=3600):
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "server": base,
        "issuer": base + REALM_PATH,
        "access_token": "acc-1",
        "refresh_token": "ref-1",
        "expires_at": time.time() + expires_in,
    }
    path.write_text(json.dumps(record), encoding="utf-8")
    os.chmod(path, 0o600)


def rpc(request_id, method, params=None):
    message = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        message["params"] = params
    return json.dumps(message)


def call(name, arguments=None):
    return {"name": name, "arguments": arguments or {}}


def run_serve(token_path, *lines):
    stdin = io.StringIO("".join(line + "\n" for line in lines))
    stdout, stderr = io.StringIO(), io.StringIO()
    dxos_mcp.serve(stdin, stdout, stderr, token_path)
    replies = [json.loads(line) for line in stdout.getvalue().splitlines()]
    return replies, stdout.getvalue(), stderr.getvalue()


def test_device_login_polls_until_approved_and_stores_tokens(fake, token_path):
    out, sleeps = io.StringIO(), []
    dxos_mcp.login(fake.base, fake.base + REALM_PATH, token_path, out, sleep=sleeps.append)
    assert sleeps == [0, 0, 5]  # pending, then slow_down raises the interval by 5 s
    assert "ABCD-EFGH" in out.getvalue()
    assert fake.base + "/device?user_code=ABCD-EFGH" in out.getvalue()
    record = json.loads(token_path.read_text(encoding="utf-8"))
    assert record["access_token"] == "acc-1"
    assert record["refresh_token"] == "ref-1"
    assert record["server"] == fake.base
    assert record["issuer"] == fake.base + REALM_PATH
    assert record["expires_at"] > time.time()
    assert "acc-1" not in out.getvalue() and "ref-1" not in out.getvalue()


def test_token_file_is_readable_by_the_owner_only(fake, token_path):
    dxos_mcp.login(fake.base, fake.base + REALM_PATH, token_path, io.StringIO(), sleep=lambda seconds: None)
    assert stat.S_IMODE(token_path.stat().st_mode) == 0o600
    assert not token_path.with_name("token.json.tmp").exists()


def test_access_denied_ends_the_login_and_stores_nothing(fake, token_path):
    fake.polls = ["access_denied"]
    with pytest.raises(dxos_mcp.LoginError):
        dxos_mcp.login(fake.base, fake.base + REALM_PATH, token_path, io.StringIO(), sleep=lambda seconds: None)
    assert not token_path.exists()


def test_initialize_list_call_and_ping(fake, token_path):
    write_token(token_path, fake.base)
    replies, _, _ = run_serve(
        token_path,
        rpc(1, "initialize", {"protocolVersion": "2025-06-18"}),
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        rpc(2, "tools/list"),
        rpc(3, "tools/call", call("list_lots")),
        rpc(4, "ping"),
    )
    assert len(replies) == 4  # the notification gets no reply
    init = replies[0]["result"]
    assert init["protocolVersion"] == "2025-06-18"
    assert init["capabilities"] == {"tools": {}}
    assert init["serverInfo"] == {"name": "dxos-mcp", "version": dxos_mcp.VERSION}
    tool = replies[1]["result"]["tools"][0]
    assert tool == {
        "name": "list_lots",
        "title": "Danh sách lô",
        "description": "Liệt kê lô của HTX.",
        "inputSchema": {"type": "object", "properties": {}},
    }
    assert replies[2]["result"]["isError"] is False
    assert "Lô LT-1" in replies[2]["result"]["content"][0]["text"]
    assert replies[3] == {"jsonrpc": "2.0", "id": 4, "result": {}}


def test_create_proposal_answers_the_proposal_as_text(fake, token_path):
    write_token(token_path, fake.base)
    replies, _, _ = run_serve(token_path, rpc(1, "tools/call", call("create_proposal", {"kind": "notification.internal"})))
    result = replies[0]["result"]
    assert result["isError"] is False
    text = result["content"][0]["text"]
    assert "p-1" in text and "Đã tạo đề xuất" in text


def test_token_near_expiry_is_refreshed_and_the_new_pair_saved(fake, token_path):
    write_token(token_path, fake.base, expires_in=5)
    replies, _, _ = run_serve(token_path, rpc(1, "tools/list"))
    assert replies[0]["result"]["tools"][0]["name"] == "list_lots"
    saved = json.loads(token_path.read_text(encoding="utf-8"))
    assert saved["access_token"] == "acc-2"
    assert saved["refresh_token"] == "ref-2"
    assert stat.S_IMODE(token_path.stat().st_mode) == 0o600


def test_failed_refresh_asks_for_login_and_the_loop_keeps_running(fake, token_path):
    fake.refresh = "gone"  # Keycloak rejects the stored refresh token
    write_token(token_path, fake.base, expires_in=5)
    replies, stdout, stderr = run_serve(token_path, rpc(1, "tools/call", call("list_lots")), rpc(2, "ping"))
    result = replies[0]["result"]
    assert result["isError"] is True
    assert result["content"][0]["text"] == (
        f"Phiên đăng nhập đã hết. Chạy: python3 dxos_mcp.py login --server {fake.base}"
    )
    assert replies[1] == {"jsonrpc": "2.0", "id": 2, "result": {}}
    assert "ref-1" not in stdout + stderr and "acc-1" not in stdout + stderr


def test_call_without_a_login_asks_for_login(token_path):
    replies, _, _ = run_serve(token_path, rpc(1, "tools/call", call("list_lots")))
    result = replies[0]["result"]
    assert result["isError"] is True
    assert "login --server <server>" in result["content"][0]["text"]


def test_revoked_session_is_reported_as_expired(fake, token_path):
    write_token(token_path, fake.base)
    fake.access = "revoked"  # the web answers 401 to the stored token
    replies, _, _ = run_serve(token_path, rpc(1, "tools/call", call("list_lots")))
    assert replies[0]["result"]["isError"] is True
    assert "login --server" in replies[0]["result"]["content"][0]["text"]


def test_web_refusal_becomes_an_error_result_with_its_message(fake, token_path):
    write_token(token_path, fake.base)
    replies, _, _ = run_serve(token_path, rpc(1, "tools/call", call("forbidden_tool")))
    result = replies[0]["result"]
    assert result == {
        "content": [{"type": "text", "text": "Bạn không có quyền dùng công cụ này."}],
        "isError": True,
    }


def test_corrupt_expiry_does_not_stop_the_loop(fake, token_path):
    write_token(token_path, fake.base)
    record = json.loads(token_path.read_text(encoding="utf-8"))
    record["expires_at"] = "soon"
    token_path.write_text(json.dumps(record), encoding="utf-8")
    replies, _, _ = run_serve(token_path, rpc(1, "tools/call", call("list_lots")), rpc(2, "ping"))
    assert replies[0]["result"]["isError"] is True
    assert replies[1] == {"jsonrpc": "2.0", "id": 2, "result": {}}


def test_malformed_messages_get_json_rpc_errors(token_path):
    replies, _, _ = run_serve(
        token_path,
        "{not json",
        "[]",
        '{"jsonrpc":"2.0","id":7}',
        rpc(8, "resources/list"),
        rpc(9, "tools/call", call("../escape")),
    )
    assert replies[0]["error"]["code"] == -32700 and replies[0]["id"] is None
    assert replies[1]["error"]["code"] == -32600 and replies[1]["id"] is None
    assert replies[2]["error"]["code"] == -32600 and replies[2]["id"] == 7
    assert replies[3]["error"]["code"] == -32601 and replies[3]["id"] == 8
    assert replies[4]["error"]["code"] == -32602 and replies[4]["id"] == 9


def test_token_values_never_reach_stdout_or_stderr(fake, token_path):
    write_token(token_path, fake.base, expires_in=5)  # forces a refresh, so both tokens are in play
    _, stdout, stderr = run_serve(
        token_path,
        rpc(1, "tools/list"),
        rpc(2, "tools/call", call("list_lots")),
        rpc(3, "tools/call", call("forbidden_tool")),
    )
    for secret in ("acc-1", "acc-2", "ref-1", "ref-2"):
        assert secret not in stdout and secret not in stderr
    login_out = io.StringIO()
    fake.polls = ["authorization_pending", "approved"]
    dxos_mcp.login(fake.base, fake.base + REALM_PATH, token_path, login_out, sleep=lambda seconds: None)
    for secret in ("acc-1", "acc-2", "ref-1", "ref-2", "device-secret"):
        assert secret not in login_out.getvalue()


def test_server_version_matches_the_web_package():
    package = json.loads((ROOT / "apps" / "web" / "package.json").read_text(encoding="utf-8"))
    assert dxos_mcp.VERSION == package["version"]
