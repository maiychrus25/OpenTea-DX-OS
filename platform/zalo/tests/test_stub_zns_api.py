# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The stub records calls, resets, and serves injected failures a limited number of times."""
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from dxos_zalo.stub_zns_api import StubState, make_handler


@pytest.fixture
def stub():
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(StubState()))
    threading.Thread(target=lambda: server.serve_forever(poll_interval=0.05), daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def post(base, path, body, headers=None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = json.loads(exc.read() or b"{}")
        exc.close()
        return exc.code, body


def test_reset_clears_calls_and_pending_failures(stub):
    post(stub, "/control/fail-next", {"code": -118, "times": 3})
    post(stub, "/message/template", {"phone": "8491"}, {"access_token": "t"})
    post(stub, "/control/reset", {})
    assert json.loads(urllib.request.urlopen(stub + "/control/calls").read()) == []
    assert post(stub, "/message/template", {"phone": "8491"}, {"access_token": "t"})[1]["error"] == 0


def test_a_failure_applies_times_calls_then_stops(stub):
    post(stub, "/control/fail-next", {"code": -108, "times": 2})
    assert [post(stub, "/message/template", {}, {"access_token": "t"})[1]["error"] for _ in range(3)] == [-108, -108, 0]


def test_a_5xx_code_is_an_http_status(stub):
    post(stub, "/control/fail-next", {"code": 502, "times": 1})
    assert post(stub, "/message/template", {}, {"access_token": "t"})[0] == 502


def test_missing_access_token_header_is_refused(stub):
    assert post(stub, "/message/template", {})[1]["error"] != 0


def test_unknown_paths_are_404(stub):
    assert post(stub, "/nope", {})[0] == 404
