# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Credential loading: one malformed file skips only its own cooperative and never logs values."""
import json
import logging

import pytest

from dxos_agent.client import load_all_agent_credentials

GOOD_ENV = "DXOS_AGENT_HTX=TC01\nDXOS_AGENT_CLIENT_ID=agent-tc01\nDXOS_AGENT_CLIENT_SECRET=good-secret\n"


def test_malformed_credential_file_is_skipped_and_only_its_name_is_logged(tmp_path, caplog):
    (tmp_path / "a_good.env").write_text(GOOD_ENV, encoding="utf-8")
    (tmp_path / "b_broken.env").write_text(
        "DXOS_AGENT_HTX=TC02\nDXOS_AGENT_CLIENT_SECRET=leaky-value\n", encoding="utf-8"
    )
    (tmp_path / "c_binary.env").write_bytes(b"\xff\xfe\x00leaky-binary")
    (tmp_path / "d_good.env").write_text(
        GOOD_ENV.replace("TC01", "TC03").replace("agent-tc01", "agent-tc03"), encoding="utf-8"
    )

    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        creds = load_all_agent_credentials(tmp_path)

    assert [c.htx_code for c in creds] == ["TC01", "TC03"]
    assert "b_broken.env" in caplog.text
    assert "c_binary.env" in caplog.text
    assert "leaky" not in caplog.text
    assert "good-secret" not in caplog.text


def _gateway_with(reply, status=None, calls=None):
    """A CoreGatewayClient whose HTTP layer answers `reply`, or fails with HTTP `status`, and records each request."""
    import io
    import urllib.error

    from dxos_agent.client import CoreGatewayClient

    def urlopen(req, timeout):
        del timeout
        body = json.loads(req.data.decode("utf-8")) if req.data else None
        if calls is not None:
            calls.append((req.get_method(), req.full_url, body))
        if status is not None:
            raise urllib.error.HTTPError(req.full_url, status, "failed", {}, io.BytesIO(b'{"error": "x"}'))
        return io.BytesIO(json.dumps(reply).encode("utf-8"))

    return CoreGatewayClient("http://gateway", lambda: "token", urlopen_fn=urlopen)


def test_claim_posts_limit_and_returns_the_requests():
    calls: list = []
    gateway = _gateway_with({"requests": [{"id": "r1", "text": "thoi tiet"}]}, calls=calls)

    assert gateway.claim_assistant_requests(2) == [{"id": "r1", "text": "thoi tiet"}]
    assert calls == [("POST", "http://gateway/api/internal/agent/assistant/claim", {"limit": 2})]


def test_post_result_sends_intent_and_run_id_and_reports_accepted():
    calls: list = []
    gateway = _gateway_with({"ok": True}, calls=calls)

    assert gateway.post_assistant_result("r1", {"type": "unknown"}, None) is True
    assert calls == [
        (
            "POST",
            "http://gateway/api/internal/agent/assistant/requests/r1/result",
            {"intent": {"type": "unknown"}, "run_id": None},
        )
    ]


def test_post_result_409_is_not_raised():
    gateway = _gateway_with({}, status=409)

    assert gateway.post_assistant_result("r1", {"type": "unknown"}, "run-1") is False


def test_post_result_other_http_errors_still_raise():
    gateway = _gateway_with({}, status=500)

    with pytest.raises(RuntimeError, match="failed \\(500\\)"):
        gateway.post_assistant_result("r1", {"type": "unknown"}, "run-1")


def test_campaign_candidates_gets_the_day_and_returns_the_answer():
    calls: list = []
    answer = {"day": "2026-11-27", "proposals": [], "rain_parcel_codes": [], "withdrawal_parcel_codes": [], "people_available": None}
    gateway = _gateway_with(answer, calls=calls)

    assert gateway.get_campaign_candidates("2026-11-27") == answer
    assert calls == [("GET", "http://gateway/api/internal/agent/campaigns/candidates?day=2026-11-27", None)]


def test_post_campaign_sends_the_body_and_returns_the_answer():
    calls: list = []
    body = {
        "day": "2026-11-27",
        "items": [{"proposal_id": "p1", "position": 1}],
        "dropped": [{"proposal_id": "p2", "rule": "withdrawal"}],
        "summary_vi": "Hôm nay có 1 việc.",
        "run_id": "run-1",
    }
    gateway = _gateway_with({"id": "c1"}, calls=calls)

    assert gateway.post_campaign(body) == {"id": "c1"}
    assert calls == [("POST", "http://gateway/api/internal/agent/campaigns", body)]
