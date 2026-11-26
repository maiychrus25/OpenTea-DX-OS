# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The allowlist CONNECT proxy: only listed hosts on listed ports, never a private address, every refusal logged."""
import socket
import socketserver
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proxy  # noqa: E402


class Echo(socketserver.BaseRequestHandler):
    def handle(self):
        while data := self.request.recv(1024):
            self.request.sendall(data)


@pytest.fixture
def echo():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Echo)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


@pytest.fixture
def start():
    servers = []

    def make(**kwargs):
        log = []
        server = proxy.make_server("127.0.0.1", 0, log=log.append, **kwargs)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        return server, log

    yield make
    for server in servers:
        server.shutdown()
        server.server_close()


@pytest.fixture
def client():
    socks = []

    def open_to(server) -> socket.socket:
        sock = socket.create_connection(server.server_address, timeout=5)
        socks.append(sock)
        return sock

    yield open_to
    for sock in socks:
        sock.close()


def connect(sock: socket.socket, target: str) -> str:
    sock.sendall(f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n".encode())
    head = b""
    while not head.endswith(b"\r\n\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            break
        head += chunk
    return head.split(b"\r\n")[0].decode()


def test_parse_allow_lowercases_and_drops_blanks():
    assert proxy.parse_allow(" API.Anthropic.com, ,api.openai.com ") == frozenset({"api.anthropic.com", "api.openai.com"})
    assert proxy.parse_allow("") == frozenset()


def test_a_host_not_on_the_list_gets_403_and_is_logged(start, client):
    server, log = start(allow=frozenset({"api.anthropic.com"}))
    assert connect(client(server), "example.com:443").endswith("403 Forbidden")
    assert any("example.com:443" in line for line in log)


def test_an_empty_list_refuses_everything(start, client):
    server, _ = start(allow=frozenset())
    assert connect(client(server), "api.anthropic.com:443").endswith("403 Forbidden")


def test_a_listed_host_on_another_port_gets_403(start, client):
    server, _ = start(allow=frozenset({"localhost"}), ports=(443,), allow_private=True)
    assert connect(client(server), "localhost:5432").endswith("403 Forbidden")


def test_a_private_address_is_refused_even_when_the_name_is_listed(start, client):
    server, log = start(allow=frozenset({"localhost"}), ports=(443,))
    assert connect(client(server), "localhost:443").endswith("403 Forbidden")
    assert any("private" in line for line in log)


def test_a_listed_host_is_tunnelled(echo, start, client):
    server, _ = start(allow=frozenset({"localhost"}), ports=(echo,), allow_private=True)
    sock = client(server)
    assert connect(sock, f"localhost:{echo}").endswith("200 Connection Established")
    sock.sendall(b"ping")
    assert sock.recv(4) == b"ping"


def test_plain_http_is_not_proxied(start, client):
    server, _ = start(allow=frozenset({"example.com"}))
    sock = client(server)
    sock.sendall(b"GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n")
    assert b" 403 " in sock.recv(200).split(b"\r\n")[0]
