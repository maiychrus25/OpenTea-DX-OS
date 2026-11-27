# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""MCP stdio bridge for outside agents.

`login` runs the OAuth 2.0 device grant on the agrimarket realm and stores the person's tokens.
`serve` speaks MCP (JSON-RPC 2.0, one message per line) and forwards tool calls to the web's bearer routes.
Standard library only. Tokens never reach stdout or stderr.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

VERSION = "1.18.0"
PROTOCOL_VERSION = "2025-06-18"
CLIENT_ID = "dxos-mcp"
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
REALM_PATH = "/auth/realms/agrimarket"
REFRESH_MARGIN_SECONDS = 30
HTTP_TIMEOUT_SECONDS = 30
TOOL_NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
SESSION_EXPIRED = "Phiên đăng nhập đã hết. Chạy: python3 dxos_mcp.py login --server {server}"
RETRY_LATER = "Không kết nối được máy chủ đăng nhập. Thử lại sau ít phút."


class SessionError(Exception):
    """The stored login cannot be used; the person runs login again."""


class LoginError(Exception):
    """The device login ended without tokens."""


class BackendError(Exception):
    """The web refused the call or could not be reached. The message is for the person."""


class RpcError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def session_expired(server):
    return SESSION_EXPIRED.format(server=server)


def default_token_path():
    return Path.home() / ".config" / "dxos-mcp" / "token.json"


def _json_body(raw):
    try:
        body = json.loads(raw)
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _send(request):
    """Return (status, JSON object). A non-2xx answer is returned; OSError means no answer came."""
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return response.status, _json_body(response.read())
    except urllib.error.HTTPError as error:
        with error:
            return error.code, _json_body(error.read())


def _post_form(url, fields):
    data = urllib.parse.urlencode(fields).encode("ascii")
    return _send(urllib.request.Request(url, data=data, method="POST", headers={"Accept": "application/json"}))


def load_token(path):
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    required = {"server", "issuer", "access_token", "refresh_token", "expires_at"}
    return record if isinstance(record, dict) and required <= record.keys() else None


def save_token(path, record):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        os.fchmod(handle.fileno(), 0o600)
        json.dump(record, handle)
    os.replace(temp, path)


def _record(server, issuer, tokens):
    return {
        "server": server,
        "issuer": issuer,
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_at": time.time() + int(tokens.get("expires_in", 0)),
    }


def login(server, issuer, token_path, out, sleep=time.sleep):
    """Run the device grant and store the tokens. Only the verification link and the user code go to `out`."""
    try:
        status, grant = _post_form(f"{issuer}/protocol/openid-connect/auth/device", {"client_id": CLIENT_ID})
    except OSError as error:
        raise LoginError("Không kết nối được máy chủ đăng nhập.") from error
    if status != 200 or "device_code" not in grant:
        raise LoginError("Không bắt đầu được đăng nhập. Kiểm tra địa chỉ máy chủ và --issuer.")
    out.write(f"Mở {grant['verification_uri_complete']} rồi nhập mã: {grant['user_code']}\n")
    out.flush()
    interval = int(grant.get("interval", 5))
    deadline = time.time() + int(grant.get("expires_in", 600))
    while time.time() < deadline:
        sleep(interval)
        try:
            status, body = _post_form(
                f"{issuer}/protocol/openid-connect/token",
                {"grant_type": DEVICE_GRANT, "device_code": grant["device_code"], "client_id": CLIENT_ID},
            )
        except OSError as error:
            raise LoginError("Không kết nối được máy chủ đăng nhập.") from error
        if status == 200 and "access_token" in body:
            save_token(token_path, _record(server, issuer, body))
            out.write("Đăng nhập thành công.\n")
            return
        error_code = body.get("error")
        if error_code == "authorization_pending":
            continue
        if error_code == "slow_down":
            interval += 5
            continue
        raise LoginError(f"Đăng nhập không hoàn tất ({error_code}). Chạy lại login.")
    raise LoginError("Hết thời gian chờ đăng nhập. Chạy lại login.")


def current_session(token_path):
    """Return the stored login, refreshing it when it expires within the margin."""
    record = load_token(token_path)
    if record is None:
        raise SessionError(session_expired("<server>"))
    if record["expires_at"] - time.time() > REFRESH_MARGIN_SECONDS:
        return record
    try:
        status, body = _post_form(
            f"{record['issuer']}/protocol/openid-connect/token",
            {"grant_type": "refresh_token", "refresh_token": record["refresh_token"], "client_id": CLIENT_ID},
        )
    except OSError as error:  # unreachable or timed out: the stored tokens may still be good
        raise BackendError(RETRY_LATER) from error
    if status >= 500 or (status == 200 and "access_token" not in body):
        raise BackendError(RETRY_LATER)
    if status != 200:  # 400 invalid_grant, 401 and the rest: the session is over
        raise SessionError(session_expired(record["server"]))
    body.setdefault("refresh_token", record["refresh_token"])
    record = _record(record["server"], record["issuer"], body)
    save_token(token_path, record)
    return record


def _web(record, method, path, payload=None):
    headers = {"Authorization": f"Bearer {record['access_token']}", "Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(record["server"].rstrip("/") + path, data=data, method=method, headers=headers)
    try:
        status, body = _send(request)
    except OSError as error:
        raise BackendError("Không kết nối được máy chủ DX-OS.") from error
    if status == 401:
        raise SessionError(session_expired(record["server"]))
    if status >= 400:
        message = body.get("message_vi")
        raise BackendError(message if isinstance(message, str) else f"Máy chủ từ chối yêu cầu (HTTP {status}).")
    return body


def list_tools(record):
    body = _web(record, "GET", "/api/mcp/tools")
    return [
        {
            "name": tool["name"],
            "title": tool["title_vi"],
            "description": tool["description_vi"],
            "inputSchema": tool["input_schema"],
        }
        for tool in body["tools"]
    ]


def call_tool(record, name, arguments):
    body = _web(record, "POST", f"/api/mcp/tools/{urllib.parse.quote(name)}", {"arguments": arguments})
    if "text" in body:
        return body["text"]
    return json.dumps(body, ensure_ascii=False)


def _error_result(text):
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _error_reply(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def call_tool_result(params, token_path, stderr):
    name, arguments = params.get("name"), params.get("arguments", {})
    if not isinstance(name, str) or not TOOL_NAME.match(name) or not isinstance(arguments, dict):
        raise RpcError(-32602, "Invalid params")
    try:
        text = call_tool(current_session(token_path), name, arguments)
    except (SessionError, BackendError) as error:
        return _error_result(str(error))
    except Exception as error:  # a broken token file or an odd reply must not stop the loop
        stderr.write(f"dxos-mcp: {type(error).__name__} during tools/call\n")
        stderr.flush()
        return _error_result("Lỗi nội bộ của dxos-mcp. Thử lại sau.")
    return {"content": [{"type": "text", "text": text}], "isError": False}


def dispatch(method, params, token_path, stderr):
    if method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "dxos-mcp", "version": VERSION},
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        try:
            return {"tools": list_tools(current_session(token_path))}
        except (SessionError, BackendError) as error:
            raise RpcError(-32000, str(error)) from error
    if method == "tools/call":
        if not isinstance(params, dict):
            raise RpcError(-32602, "Invalid params")
        return call_tool_result(params, token_path, stderr)
    raise RpcError(-32601, "Method not found")


def handle_line(line, token_path, stderr):
    try:
        message = json.loads(line)
    except ValueError:
        return _error_reply(None, -32700, "Parse error")
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
        return _error_reply(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid Request")
    if "id" not in message:
        return None  # notifications get no reply
    try:
        result = dispatch(message["method"], message.get("params", {}), token_path, stderr)
    except RpcError as error:
        return _error_reply(message["id"], error.code, str(error))
    except Exception as error:  # the loop survives any single bad message
        stderr.write(f"dxos-mcp: {type(error).__name__} while handling {message['method']}\n")
        stderr.flush()
        return _error_reply(message["id"], -32603, "Internal error")
    return {"jsonrpc": "2.0", "id": message["id"], "result": result}


def serve(stdin, stdout, stderr, token_path):
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        reply = handle_line(line, token_path, stderr)
        if reply is not None:
            stdout.write(json.dumps(reply) + "\n")
            stdout.flush()


def main(argv=None):
    parser = argparse.ArgumentParser(description="DX-OS MCP bridge")
    commands = parser.add_subparsers(dest="command", required=True)
    login_parser = commands.add_parser("login", help="log in with the device grant")
    login_parser.add_argument("--server", required=True, help="web base URL")
    login_parser.add_argument("--issuer", help="Keycloak realm URL; default <server>/auth/realms/agrimarket")
    commands.add_parser("serve", help="serve MCP over stdio")
    args = parser.parse_args(argv)
    token_path = default_token_path()
    if args.command == "serve":
        serve(sys.stdin, sys.stdout, sys.stderr, token_path)
        return 0
    server = args.server.rstrip("/")
    issuer = (args.issuer or f"{server}{REALM_PATH}").rstrip("/")
    try:
        login(server, issuer, token_path, sys.stdout)
    except LoginError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
