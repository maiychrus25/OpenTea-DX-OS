# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The test-only Piper stub speaks enough of the Wyoming protocol for the web's PiperTtsAdapter to build a WAV file."""
import importlib.util
import json
import socket
import threading
from pathlib import Path

import pytest


@pytest.fixture
def stub():
    spec = importlib.util.spec_from_file_location("stub_tts", Path(__file__).resolve().parent / "stub_tts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    server = module.make_server(0, "127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1], module
    server.shutdown()
    server.server_close()
    thread.join()


def converse(port, line):
    with socket.create_connection(("127.0.0.1", port), timeout=5) as conn:
        conn.sendall(line)
        chunks = []
        while chunk := conn.recv(65536):
            chunks.append(chunk)
    return b"".join(chunks)


def test_synthesize_is_answered_with_one_audio_chunk_and_a_stop(stub):
    port, module = stub
    raw = converse(port, json.dumps({"type": "synthesize", "data": {"text": "xin chào"}}).encode() + b"\n")
    header, rest = raw.split(b"\n", 1)
    event = json.loads(header)
    assert event["type"] == "audio-chunk"
    data = json.loads(rest[: event["data_length"]])
    assert data["rate"] == module.RATE
    payload = rest[event["data_length"] : event["data_length"] + event["payload_length"]]
    assert len(payload) == module.SAMPLES * 2
    assert json.loads(rest[event["data_length"] + event["payload_length"] :]) == {"type": "audio-stop"}


def test_anything_else_is_closed_without_an_answer(stub):
    port, _ = stub
    assert converse(port, b'{"type": "describe"}\n') == b""
