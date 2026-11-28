# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""ZNS send and token refresh against the stub; every error code the relay relies on comes from the one table."""
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from dxos_zalo.stub_zns_api import StubState, make_handler
from dxos_zalo.zns_api import ERROR_CODES, ZnsApi, ZnsError

ITEM = {"id": "1", "phone": "84912345678", "zns_template_id": "100200", "template_data": {"price": "120.000"}, "tracking_id": "trk-1"}


@pytest.fixture
def stub():
    state = StubState()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.05), daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()
    thread.join()


def control(base, path, body=None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def api(base):
    return ZnsApi(base, f"{base}/oa/access_token", "app-1", "secret-1")


def test_send_posts_the_template_and_returns_the_message_id(stub):
    msg_id = api(stub).send("tok-1", ITEM)
    assert msg_id
    call = control(stub, "/control/calls")[0]
    assert call["path"] == "/message/template" and call["access_token"] == "tok-1"
    assert call["body"] == {"phone": "84912345678", "template_id": "100200", "template_data": {"price": "120.000"}, "tracking_id": "trk-1"}


@pytest.mark.parametrize("code", [c for c, e in ERROR_CODES.items() if e.permanent])
def test_every_permanent_code_is_permanent(stub, code):
    control(stub, "/control/fail-next", {"code": code, "times": 1})
    with pytest.raises(ZnsError) as err:
        api(stub).send("tok", ITEM)
    assert err.value.permanent and err.value.code == code
    api(stub).send("tok", ITEM)  # the injected failure was used up


def test_server_error_is_retryable(stub):
    control(stub, "/control/fail-next", {"code": 503, "times": 1})
    with pytest.raises(ZnsError) as err:
        api(stub).send("tok", ITEM)
    assert not err.value.permanent and not err.value.token_expired


def test_expired_token_is_flagged_and_not_permanent(stub):
    code = next(c for c, e in ERROR_CODES.items() if e.token_expired)
    control(stub, "/control/fail-next", {"code": code, "times": 1})
    with pytest.raises(ZnsError) as err:
        api(stub).send("tok", ITEM)
    assert err.value.token_expired and not err.value.permanent


def test_unreachable_host_is_a_retryable_error():
    with pytest.raises(ZnsError) as err:
        ZnsApi("http://127.0.0.1:1", "http://127.0.0.1:1/oa", "a", "b").send("tok", ITEM)
    assert not err.value.permanent and "tok" not in str(err.value)


def test_refresh_returns_new_tokens_with_a_lifetime(stub):
    tokens = api(stub).refresh("old-refresh")
    assert tokens["access_token"] and tokens["refresh_token"] and tokens["expires_in"] > 0
    call = control(stub, "/control/calls")[0]
    assert call["path"] == "/oa/access_token" and call["secret_key"] == "secret-1"
    assert call["body"]["refresh_token"] == "old-refresh" and call["body"]["app_id"] == "app-1"
    assert call["body"]["grant_type"] == "refresh_token"


def test_refresh_without_app_credentials_fails_clearly(stub):
    with pytest.raises(ZnsError):
        ZnsApi(stub, f"{stub}/oa/access_token", "", "").refresh("r")
