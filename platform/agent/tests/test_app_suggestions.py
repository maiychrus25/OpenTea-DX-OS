# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""M9: the agent asks each enabled mini-app for suggestions and posts them as proposals of kind app.<id>.<action>."""
from datetime import datetime, timezone
import logging
from typing import Any

import pytest

from dxos_agent.agents.app_suggestions import run_app_suggestions
from dxos_agent.client import GatewayHTTPError
from dxos_agent.evidence import canonical_json, sha256_hex
from test_client import _gateway_with

NOW = datetime(2026, 11, 27, 3, 0, tzinfo=timezone.utc)
MANIFEST = {"agent": {"suggestions": "/agent/suggestions", "actions": [{"name": "promotion.create"}]}}
SUGGESTION = {
    "action": "promotion.create",
    "payload": {"product_id": "p1", "discount_pct": 10, "days": 7},
    "labels": {"product_name": "Chè Tân Cương 200 g"},
    "reason_vi": "Sản phẩm còn 40 gói, 21 ngày chưa bán được gói nào.",
    "subjects": ["p1"],
}


class AppGateway:
    """Serves enabled apps and their suggestions; records runs and the proposals posted."""

    def __init__(self, apps, suggestions, refuse=()):
        self.apps, self.suggestions, self.refuse = apps, suggestions, set(refuse)
        self.fetched: list[tuple[str, str]] = []
        self.runs: list[dict[str, Any]] = []
        self.finished: list[dict[str, Any]] = []
        self.posted: list[dict[str, Any]] = []

    def get_enabled_apps(self):
        return self.apps

    def get_app_suggestions(self, app_id, path):
        self.fetched.append((app_id, path))
        result = self.suggestions[app_id]
        if isinstance(result, Exception):
            raise result
        return result

    def start_run(self, **kwargs):
        self.runs.append(kwargs)
        return f"run-{len(self.runs)}"

    def finish_run(self, run_id, status, **kwargs):
        self.finished.append({"id": run_id, "status": status, **kwargs})

    def submit_proposal(self, proposal):
        if proposal["payload"].get("product_id") in self.refuse:
            raise GatewayHTTPError("refused", 400)
        self.posted.append(proposal)
        return {"deduped": False}


def apps(*ids):
    return [{"id": i, "manifest": MANIFEST} for i in ids]


def test_a_suggestion_becomes_an_app_proposal_with_labels_and_evidence():
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": [SUGGESTION]})

    run_app_suggestions(gateway, NOW)

    assert gateway.fetched == [("tea-shop", "/agent/suggestions")]
    [sent] = gateway.posted
    assert sent["agent"] == "app:tea-shop" and sent["kind"] == "app.tea-shop.promotion.create"
    assert sent["payload"] == {**SUGGESTION["payload"], "_labels": SUGGESTION["labels"]}
    assert sent["reason_vi"] == SUGGESTION["reason_vi"] and sent["run_id"] == "run-1"
    digest = sha256_hex(canonical_json(SUGGESTION["payload"]))  # the payload without its labels
    row = {"table": "app:tea-shop", "id": "p1", "sha256": digest}
    assert sent["evidence"]["rows"] == [row]
    assert sent["evidence"]["sha256"] == sha256_hex(canonical_json([row]))
    assert gateway.runs[0]["agent"] == "app:tea-shop" and gateway.finished[0]["status"] == "ok"


def test_no_suggestions_means_no_run_row():
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": []})
    run_app_suggestions(gateway, NOW)
    assert gateway.runs == [] and gateway.posted == []


def test_an_app_without_an_agent_block_is_never_called():
    gateway = AppGateway([{"id": "plain", "manifest": {}}, {"id": "odd", "manifest": None}], {})
    run_app_suggestions(gateway, NOW)
    assert gateway.fetched == []


def test_unknown_action_and_bad_shapes_are_skipped_and_logged(caplog):
    bad = [
        {**SUGGESTION, "action": "promotion.delete"},
        {**SUGGESTION, "payload": "x"},
        {**SUGGESTION, "reason_vi": ""},
        {**SUGGESTION, "labels": {"a": 1}},
        {**SUGGESTION, "payload": {"discount_pct": 1.5}},  # evidence is integers only
        "nope",
    ]
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": [*bad, SUGGESTION]})
    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        run_app_suggestions(gateway, NOW)
    assert [p["payload"]["product_id"] for p in gateway.posted] == ["p1"]
    assert caplog.text.count("tea-shop") >= len(bad)


def test_at_most_ten_suggestions_are_posted():
    many = [{**SUGGESTION, "payload": {**SUGGESTION["payload"], "product_id": f"p{n}"}, "subjects": [f"p{n}"]} for n in range(12)]
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": many})
    run_app_suggestions(gateway, NOW)
    assert len(gateway.posted) == 10


def test_a_refused_suggestion_is_logged_and_the_rest_go_on(caplog):
    second = {**SUGGESTION, "payload": {**SUGGESTION["payload"], "product_id": "p2"}, "subjects": ["p2"]}
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": [SUGGESTION, second]}, refuse={"p1"})
    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        run_app_suggestions(gateway, NOW)
    assert [p["payload"]["product_id"] for p in gateway.posted] == ["p2"]
    assert gateway.finished[0]["status"] == "ok" and "refused" in caplog.text


def test_one_failing_app_does_not_stop_the_next(caplog):
    gateway = AppGateway(apps("a-app", "tea-shop"), {"a-app": RuntimeError("down"), "tea-shop": [SUGGESTION]})
    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        run_app_suggestions(gateway, NOW)
    assert len(gateway.posted) == 1 and "a-app" in caplog.text


def test_no_subject_falls_back_to_the_action_name():
    gateway = AppGateway(apps("tea-shop"), {"tea-shop": [{**SUGGESTION, "subjects": []}]})
    run_app_suggestions(gateway, NOW)
    assert gateway.posted[0]["evidence"]["rows"][0]["id"] == "promotion.create"


def test_client_reads_apps_through_graphql_and_suggestions_through_the_gateway():
    calls: list = []
    gateway = _gateway_with({"data": {"platform_installed_apps": [{"id": "tea-shop", "manifest": MANIFEST}]}}, calls=calls)
    assert gateway.get_enabled_apps() == [{"id": "tea-shop", "manifest": MANIFEST}]
    assert calls[0][1] == "http://gateway/api/data/graphql" and "platform_installed_apps" in calls[0][2]["query"]
    calls.clear()
    gateway = _gateway_with({"suggestions": [SUGGESTION]}, calls=calls)
    assert gateway.get_app_suggestions("tea-shop", "/agent/suggestions") == [SUGGESTION]
    assert calls == [("GET", "http://gateway/apps/tea-shop/agent/suggestions", None)]
