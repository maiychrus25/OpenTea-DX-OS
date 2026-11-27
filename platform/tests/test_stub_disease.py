# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The test-only disease API stub answers one fixed tea result and records what it was sent (never the photo or the token)."""
import importlib.util
import json
import threading
import urllib.request
from pathlib import Path

import pytest


@pytest.fixture
def stub():
    spec = importlib.util.spec_from_file_location("stub_disease", Path(__file__).resolve().parent / "stub_disease.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    server = module.make_server(0, "127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}", module
    server.shutdown()
    server.server_close()
    thread.join()


def post(base, path, body, headers):
    return urllib.request.urlopen(urllib.request.Request(base + path, data=body, method="POST", headers=headers), timeout=5)


def test_predict_answers_the_fixed_label_and_records_the_request_shape(stub):
    base, module = stub
    body = b'--b\r\nContent-Disposition: form-data; name="file"; filename="diagnosis.jpg"\r\n\r\n\xff\xd8\xff\x00\r\n--b--\r\n'
    reply = json.loads(post(base, "/predict?model=tea", body, {"Authorization": "Bearer secret-token", "Content-Type": "multipart/form-data; boundary=b"}).read())
    assert reply == {"disease_name_vi": module.LABEL, "confidence": module.CONFIDENCE, "uncertain": False}
    recorded = json.loads(urllib.request.urlopen(base + "/control/requests", timeout=5).read())["requests"]
    assert recorded == [{"path": "/predict", "model": "tea", "bearer": True, "multipart": True, "jpeg": True}]
    assert "secret-token" not in json.dumps(recorded)


def test_a_request_without_a_bearer_token_is_recorded_as_such(stub):
    base, _ = stub
    post(base, "/predict?model=tea", b"x", {"Content-Type": "multipart/form-data; boundary=b"}).read()
    assert json.loads(urllib.request.urlopen(base + "/control/requests", timeout=5).read())["requests"][0]["bearer"] is False


def test_health_and_reset(stub):
    base, _ = stub
    assert json.loads(urllib.request.urlopen(base + "/health", timeout=5).read()) == {"status": "ok"}
    post(base, "/predict?model=general", b"x", {}).read()
    post(base, "/control/reset", b"{}", {}).read()
    assert json.loads(urllib.request.urlopen(base + "/control/requests", timeout=5).read())["requests"] == []
