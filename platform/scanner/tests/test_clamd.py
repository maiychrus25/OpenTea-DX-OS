# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import socket
import socketserver
import struct
import threading
import time

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


def _read_request(sock):
    buf = b""
    while not buf.endswith(b"\0\0\0\0"):
        data = sock.recv(65536)
        if not data:
            break
        buf += data
    return buf


def _serve(received, reply):
    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            received.append(_read_request(self.request))
            reply(self.request)

    server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    return server, thread


@pytest.fixture
def serve_clamd():
    """Factory: serve_clamd(reply) -> (port, received); reply(sock) writes the response."""
    started = []

    def start(reply):
        received = []
        server, thread = _serve(received, reply)
        started.append((server, thread))
        return server.server_address[1], received

    yield start
    for server, thread in started:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.fixture
def fake_clamd(serve_clamd):
    return serve_clamd(lambda sock: sock.sendall(b"stream: OK\0"))


def _drain_until_closed(sock):
    while sock.recv(4096):
        pass


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


def test_scan_stream_zero_chunks(fake_clamd):
    port, received = fake_clamd
    assert scan_stream("127.0.0.1", port, []) == ScanResult("clean", None)
    assert received == [b"zINSTREAM\0" + b"\0\0\0\0"]


def test_scan_stream_skips_empty_chunk(fake_clamd):
    port, received = fake_clamd
    scan_stream("127.0.0.1", port, [b"", b"ab", b""])
    assert received == [b"zINSTREAM\0" + struct.pack(">I", 2) + b"ab" + b"\0\0\0\0"]


def test_scan_stream_early_eof(serve_clamd):
    port, _ = serve_clamd(lambda sock: sock.sendall(b"stream: O"))
    with pytest.raises(ClamdUnavailable):
        scan_stream("127.0.0.1", port, [b"x"], timeout=2)


def test_scan_stream_reply_timeout(serve_clamd):
    port, _ = serve_clamd(_drain_until_closed)
    with pytest.raises(ClamdUnavailable):
        scan_stream("127.0.0.1", port, [b"x"], timeout=0.3)


def test_scan_stream_split_reply(serve_clamd):
    def reply(sock):
        sock.sendall(b"stream: O")
        time.sleep(0.05)
        sock.sendall(b"K\0")

    port, _ = serve_clamd(reply)
    assert scan_stream("127.0.0.1", port, [b"x"], timeout=2) == ScanResult("clean", None)


def test_scan_stream_oversized_reply(serve_clamd):
    def reply(sock):
        try:
            sock.sendall(b"a" * 100000)
        except OSError:
            pass  # client hung up after the cap

    port, _ = serve_clamd(reply)
    with pytest.raises(ClamdUnavailable, match="oversized"):
        scan_stream("127.0.0.1", port, [b"x"], timeout=2)


def test_scan_stream_unexpected_reply(serve_clamd):
    port, _ = serve_clamd(lambda sock: sock.sendall(b"UNKNOWN COMMAND\0"))
    with pytest.raises(ClamdUnavailable):
        scan_stream("127.0.0.1", port, [b"x"], timeout=2)
