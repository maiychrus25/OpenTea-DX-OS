# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The builder's allowlist CONNECT proxy (plan M13, C6). Standard library only.

The `build` container sits on an internal network and reaches the internet only through this process. A CONNECT goes
through only for a listed host on a listed port, and never to a private address. Everything else gets 403 and a log line.
"""
import ipaddress
import os
import select
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORTS = (443,)
IDLE_SECONDS = 300


def parse_allow(text: str) -> frozenset[str]:
    return frozenset(host.strip().lower() for host in text.split(",") if host.strip())


def private_address(host: str, port: int) -> bool:
    """True when the name does not resolve, or any address it resolves to is not a public one."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        return True
    return any(not ipaddress.ip_address(info[4][0]).is_global for info in infos)


def make_server(bind: str, port: int, allow: frozenset[str], ports=DEFAULT_PORTS, allow_private: bool = False,
                log=lambda line: print(line, file=sys.stderr, flush=True)) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):  # the refusals are logged below; the default per-request line is noise
            pass

        def refuse(self, why: str) -> None:
            log(f"refused {self.command} {self.path}: {why}")
            body = b"refused\n"
            self.send_response(403)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def do_CONNECT(self):
            host, _, raw_port = self.path.rpartition(":")
            host = host.strip("[]").lower()
            if not raw_port.isascii() or not raw_port.isdigit():
                return self.refuse("bad target")
            target_port = int(raw_port)
            if host not in allow:
                return self.refuse("host not allowed")
            if target_port not in ports:
                return self.refuse("port not allowed")
            if not allow_private and private_address(host, target_port):
                return self.refuse("private address")
            try:
                upstream = socket.create_connection((host, target_port), timeout=10)
            except OSError as exc:
                return self.refuse(f"cannot connect: {exc.strerror or exc}")
            self.send_response(200, "Connection Established")
            self.end_headers()
            self.close_connection = True
            with upstream:
                self.tunnel(upstream)

        def tunnel(self, upstream: socket.socket) -> None:
            client = self.connection
            sockets = [client, upstream]
            while True:
                ready, _, _ = select.select(sockets, [], [], IDLE_SECONDS)
                if not ready:
                    return
                for sock in ready:
                    data = sock.recv(65536)
                    if not data:
                        return
                    (upstream if sock is client else client).sendall(data)

        def do_GET(self):
            self.refuse("only CONNECT is proxied")

        do_POST = do_PUT = do_DELETE = do_HEAD = do_PATCH = do_OPTIONS = do_GET

    server = ThreadingHTTPServer((bind, port), Handler)
    server.daemon_threads = True
    return server


if __name__ == "__main__":
    allowed = parse_allow(os.environ.get("DXOS_BUILDER_ALLOW_HOSTS", ""))
    print(f"proxy allows: {', '.join(sorted(allowed)) or '(nothing)'}", file=sys.stderr, flush=True)
    make_server("0.0.0.0", 3128, allowed).serve_forever()
