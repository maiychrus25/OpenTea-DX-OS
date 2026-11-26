# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A10 gateway calls: the inputs read, the improvement post and the effect post (contract C3, C5)."""
import io
import json
import urllib.error

import pytest

from dxos_agent.client import CoreGatewayClient, GatewayHTTPError


def _gateway(reply, status=None, calls=None):
    def urlopen(req, timeout):
        del timeout
        body = json.loads(req.data.decode("utf-8")) if req.data else None
        if calls is not None:
            calls.append((req.get_method(), req.full_url, body))
        if status is not None:
            raise urllib.error.HTTPError(req.full_url, status, "failed", {}, io.BytesIO(b'{"error": "x"}'))
        return io.BytesIO(json.dumps(reply).encode("utf-8"))

    return CoreGatewayClient("http://gateway", lambda: "token", urlopen_fn=urlopen)


def test_improvement_inputs_are_read_for_one_week_and_unwrapped_from_data():
    calls: list = []
    inputs = {"week": "2026-11-30", "settings": {}, "proposal_stats": [], "metrics": {}}
    gateway = _gateway({"data": inputs}, calls=calls)

    assert gateway.get_improvement_inputs("2026-11-30") == inputs
    assert calls == [
        ("GET", "http://gateway/api/internal/agent/improvements/inputs?week=2026-11-30", None),
    ]


def test_post_improvement_sends_the_body_and_returns_the_data():
    calls: list = []
    body = {"week": "2026-11-30", "kind": "process", "metric_key": "median_wait_hours", "run_id": "r1"}
    gateway = _gateway({"data": {"id": "imp-1", "proposal_id": "p-1"}}, calls=calls)

    assert gateway.post_improvement(body) == {"id": "imp-1", "proposal_id": "p-1"}
    assert calls == [("POST", "http://gateway/api/internal/agent/improvements", body)]


def test_post_improvement_returns_the_deduped_answer():
    gateway = _gateway({"data": {"deduped": True}})

    assert gateway.post_improvement({"week": "2026-11-30"}) == {"deduped": True}


def test_post_improvement_effect_posts_to_the_improvement_path():
    calls: list = []
    body = {"after": "2w", "value": 0.4, "verdict": "helped"}
    gateway = _gateway({"data": {"id": "imp-1"}}, calls=calls)

    assert gateway.post_improvement_effect("imp-1", body) == {"id": "imp-1"}
    assert calls == [("POST", "http://gateway/api/internal/agent/improvements/imp-1/effect", body)]


@pytest.mark.parametrize("status", [400, 409, 422])
def test_refusals_surface_their_status_code(status):
    gateway = _gateway({}, status=status)

    with pytest.raises(GatewayHTTPError) as caught:
        gateway.post_improvement({"week": "2026-11-30"})
    assert caught.value.status_code == status
