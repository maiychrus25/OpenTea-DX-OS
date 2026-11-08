# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Minimal clamd INSTREAM client."""
import socket
import struct
from dataclasses import dataclass
from typing import Iterable, Literal

MAX_FRAME = 65536


@dataclass(frozen=True)
class ScanResult:
    status: Literal["clean", "infected", "unscannable"]
    signature: str | None


class ClamdUnavailable(Exception):
    """Infrastructure failure talking to clamd; never a file verdict."""


def parse_response(raw: bytes) -> ScanResult:
    text = raw.rstrip(b"\0\n").decode("utf-8", "replace")
    if text == "stream: OK":
        return ScanResult("clean", None)
    if text.endswith(" FOUND") and text.startswith("stream: "):
        return ScanResult("infected", text[len("stream: "):-len(" FOUND")])
    if text.endswith(" ERROR"):
        return ScanResult("unscannable", text)
    raise ValueError(f"unexpected clamd response: {text!r}")


def scan_stream(host: str, port: int, chunks: Iterable[bytes], timeout: float = 30.0) -> ScanResult:
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            sock.sendall(b"zINSTREAM\0")
            for chunk in chunks:
                view = memoryview(chunk)
                for i in range(0, len(view), MAX_FRAME):
                    part = view[i:i + MAX_FRAME]
                    sock.sendall(struct.pack(">I", len(part)) + part)
            sock.sendall(b"\0\0\0\0")
            reply = b""
            while not reply.endswith(b"\0"):
                data = sock.recv(4096)
                if not data:
                    raise ClamdUnavailable("clamd closed the connection before replying")
                reply += data
    except OSError as exc:  # includes timeouts and connection resets
        raise ClamdUnavailable(str(exc)) from exc
    return parse_response(reply)
