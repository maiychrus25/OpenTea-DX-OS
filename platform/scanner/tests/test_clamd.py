# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import socket
import socketserver
import struct
import threading

import pytest

from dxos_scanner.clamd import ClamdUnavailable, ScanResult, parse_response, scan_stream


def test_parse_ok():
    assert parse_response(b"stream: OK\0") == ScanResult("clean", None)


def test_parse_found():
    r = parse_response(b"stream: Win.Test.EICAR_HDB-1 FOUND\0")
    assert r == ScanResult("infected", "Win.Test.EICAR_HDB-1")


def test_parse_size_limit():
    r = parse_response(b"INSTREAM size limit exceeded. ERROR\0")
    assert r.status == "unscannable"


def test_parse_error():
    r = parse_response(b"stream: lstat() failed ERROR\n")
    assert r.status == "unscannable"


def test_parse_garbage_raises():
    with pytest.raises(ValueError):
        parse_response(b"hello\0")


@pytest.fixture
def fake_clamd():
    received = []

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            buf = b""
            while not buf.endswith(b"\0\0\0\0"):
                data = self.request.recv(65536)
                if not data:
                    break
                buf += data
            received.append(buf)
            self.request.sendall(b"stream: OK\0")

    server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1], received
    server.shutdown()
    server.server_close()
    thread.join()


def test_scan_stream_protocol(fake_clamd):
    port, received = fake_clamd
    big = b"a" * 102400
    result = scan_stream("127.0.0.1", port, [b"hello", big])
    assert result == ScanResult("clean", None)
    frame = lambda b: struct.pack(">I", len(b)) + b
    expected = (
        b"zINSTREAM\0" + frame(b"hello") + frame(big[:65536]) + frame(big[65536:]) + b"\0\0\0\0"
    )
    assert received == [expected]
    assert len(big[65536:]) == 36864


def test_scan_stream_unavailable():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    with pytest.raises(ClamdUnavailable):
        scan_stream("127.0.0.1", port, [b"x"], timeout=2)
