# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The test-only STT stub answers a fixed text and records the shape of what the relay posts."""
import importlib.util
import json
import sys
import threading
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def stub():
    spec = importlib.util.spec_from_file_location("stub_stt", Path(__file__).resolve().parent / "stub_stt.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    server = module.make_server(0, "127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}", module
    server.shutdown()
    server.server_close()
    thread.join()


def test_relay_client_gets_the_fixed_text_and_the_stub_records_an_ogg_multipart_post(stub):
    base, module = stub
    sys.path.insert(0, str(ROOT / "platform" / "telegram"))
    try:
        from dxos_telegram.stt import SttClient
    finally:
        sys.path.pop(0)
    assert SttClient(base).transcribe(b"OggS\x00fixture") == module.TEXT
    recorded = json.loads(urllib.request.urlopen(base + "/control/requests", timeout=5).read())["requests"]
    assert len(recorded) == 1 and recorded[0]["ogg"] and recorded[0]["multipart"]
    urllib.request.urlopen(urllib.request.Request(base + "/control/reset", data=b"{}", method="POST"), timeout=5).read()
    assert json.loads(urllib.request.urlopen(base + "/control/requests", timeout=5).read())["requests"] == []
