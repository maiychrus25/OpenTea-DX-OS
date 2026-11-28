# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The relay against the stub ZNS server and a fake web, all on localhost: the whole contract end to end."""
import json
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from dxos_zalo.gateway import WebGateway
from dxos_zalo.relay import REFRESH_MARGIN_SECONDS, OaTokens, Relay, _epoch
from dxos_zalo.stub_zns_api import StubState, make_handler
from dxos_zalo.zns_api import ERROR_CODES, ZnsApi

NOW = 1_800_000_000.0


class FakeWeb:
    def __init__(self) -> None:
        self.outbox, self.results, self.saved, self.ticks, self.heartbeats = [], {}, [], 0, 0
        self.credentials = {"access_token": "acc-1", "refresh_token": "ref-1", "expires_at": NOW + 3600}
        self.save_status = 200
        self.credential_reads = 0


def serve(handler_factory):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler_factory)
    threading.Thread(target=lambda: server.serve_forever(poll_interval=0.05), daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def web_handler(web: FakeWeb):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            return

        def _json(self, status, payload):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")

        def do_GET(self):
            assert self.headers["Authorization"] == "Bearer kc-token"
            if self.path.startswith("/api/internal/zalo/outbox?limit="):
                items, web.outbox = web.outbox, []
                return self._json(200, {"data": items})
            if self.path == "/api/internal/zalo/credentials":
                web.credential_reads += 1
                return self._json(200, {"data": web.credentials})
            self._json(404, {})

        def do_POST(self):
            body = self._body()
            if self.path.startswith("/api/internal/zalo/outbox/") and self.path.endswith("/result"):
                web.results[self.path.split("/")[-2]] = body
                return self._json(200, {"data": {}})
            if self.path == "/api/internal/zalo/tick":
                web.ticks += 1
                return self._json(200, {"data": {"queued": 2}})
            if self.path == "/api/internal/zalo/heartbeat":
                web.heartbeats += 1
                return self._json(200, {"data": {}})
            if self.path == "/api/internal/zalo/credentials":
                if web.save_status != 200:
                    return self._json(web.save_status, {})
                web.saved.append(body)
                web.credentials = body
                return self._json(200, {"data": {}})
            self._json(404, {})

    return Handler


@pytest.fixture
def env():
    web, stub_state = FakeWeb(), StubState()
    web_server, web_url = serve(web_handler(web))
    stub_server, stub_url = serve(make_handler(stub_state))
    clock = [NOW]
    gateway = WebGateway(web_url, lambda: "kc-token")
    zns = ZnsApi(stub_url, f"{stub_url}/oa/access_token", "app-1", "secret-1")
    relay = Relay(zns, gateway, "test", OaTokens(gateway, zns, lambda: clock[0]))
    yield type("Env", (), {"web": web, "stub": stub_url, "relay": relay, "clock": clock, "state": stub_state})
    for server in (web_server, stub_server):
        server.shutdown()
        server.server_close()


def item(n, phone="84912345678"):
    return {"id": f"id-{n}", "phone": phone, "zns_template_id": "100200", "template_data": {"price": "120.000"}, "tracking_id": f"trk-{n}"}


def calls(env):
    with urllib.request.urlopen(env.stub + "/control/calls", timeout=5) as resp:
        return json.loads(resp.read())


def fail_next(env, code, times=1):
    urllib.request.urlopen(urllib.request.Request(env.stub + "/control/fail-next", data=json.dumps({"code": code, "times": times}).encode(), method="POST"), timeout=5).read()


def test_a_leased_row_is_sent_and_reported_with_the_message_id(env):
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    sent = calls(env)
    assert len(sent) == 1 and sent[0]["access_token"] == "acc-1" and sent[0]["body"]["tracking_id"] == "trk-1"
    assert env.web.results["id-1"]["ok"] is True and env.web.results["id-1"]["zalo_msg_id"]


@pytest.mark.parametrize("code", [c for c, e in ERROR_CODES.items() if e.permanent])
def test_a_permanent_error_is_reported_permanent_and_sent_once(env, code):
    fail_next(env, code)
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    result = env.web.results["id-1"]
    assert result["ok"] is False and result["permanent"] is True and result["error"]
    # The web turns the Zalo code into a Vietnamese reason, so the code must be in the text.
    assert result["error"].startswith(f"{code} ")
    assert len(calls(env)) == 1


def test_a_server_error_is_reported_retryable_and_the_batch_goes_on(env):
    fail_next(env, 503)
    env.web.outbox = [item(1), item(2)]
    env.relay.run_outbox_once()
    assert env.web.results["id-1"]["ok"] is False and env.web.results["id-1"]["permanent"] is False
    assert env.web.results["id-2"]["ok"] is True


def test_no_oa_token_means_no_lease_and_no_tick_only_heartbeat(env):
    env.web.credentials = None
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    env.relay.run_tick_once()
    env.relay.run_heartbeat_once()
    assert env.web.outbox == [item(1)] and env.web.results == {} and calls(env) == []
    assert env.web.ticks == 0 and env.web.heartbeats == 1


def test_tick_and_heartbeat_reach_the_web(env):
    env.relay.run_tick_once()
    env.relay.run_heartbeat_once()
    assert env.web.ticks == 1 and env.web.heartbeats == 1


def test_a_token_close_to_expiry_is_refreshed_and_saved_before_sending(env):
    env.web.credentials["expires_at"] = NOW + REFRESH_MARGIN_SECONDS - 1
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    assert len(env.web.saved) == 1
    saved = env.web.saved[0]
    assert saved["access_token"] != "acc-1" and saved["refresh_token"] != "ref-1" and _epoch(saved["expires_at"]) > NOW + 3600
    assert [c["path"] for c in calls(env)] == ["/oa/access_token", "/message/template"]
    assert calls(env)[1]["access_token"] == saved["access_token"]


def test_an_expired_token_error_refreshes_once_and_resends(env):
    code = next(c for c, e in ERROR_CODES.items() if e.token_expired)
    fail_next(env, code)
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    assert [c["path"] for c in calls(env)] == ["/message/template", "/oa/access_token", "/message/template"]
    assert env.web.results["id-1"]["ok"] is True and len(env.web.saved) == 1


def test_a_token_that_stays_expired_is_reported_retryable_not_looped(env):
    code = next(c for c, e in ERROR_CODES.items() if e.token_expired)
    fail_next(env, code, times=5)
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    assert env.web.results["id-1"]["ok"] is False and env.web.results["id-1"]["permanent"] is False
    assert len(calls(env)) == 3  # send, refresh, send


def test_a_refresh_token_that_could_not_be_saved_is_kept_and_saved_later(env):
    env.web.credentials["expires_at"] = NOW + 10
    env.web.save_status = 503
    env.web.outbox = [item(1)]
    env.relay.run_outbox_once()
    assert env.web.results["id-1"]["ok"] is True and env.web.saved == []
    env.web.save_status = 200
    env.web.outbox = [item(2)]
    env.relay.run_outbox_once()
    assert len(env.web.saved) == 1 and env.web.saved[0]["refresh_token"] != "ref-1"
    assert calls(env)[-1]["access_token"] == env.web.saved[0]["access_token"]


def test_credentials_are_cached_between_cycles(env):
    for n in range(3):
        env.web.outbox = [item(n)]
        env.relay.run_outbox_once()
    assert env.web.credential_reads == 1
    env.clock[0] += 120
    env.relay.run_outbox_once()
    assert env.web.credential_reads == 2


def test_a_malformed_row_is_reported_permanent_without_calling_zalo(env):
    env.web.outbox = [{"id": "id-9", "phone": "84912345678"}]
    env.relay.run_outbox_once()
    assert env.web.results["id-9"]["permanent"] is True and calls(env) == []


def test_logs_show_at_most_the_last_three_digits_of_a_phone(env, caplog):
    fail_next(env, 503)
    env.web.outbox = [item(1)]
    with caplog.at_level("DEBUG", logger="dxos_zalo"):
        env.relay.run_outbox_once()
    text = caplog.text
    assert "84912345678" not in text and "acc-1" not in text
