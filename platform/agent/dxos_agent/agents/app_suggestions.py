# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""M9: ask each enabled mini-app what it suggests and post the answers as proposals of kind app.<id>.<action> (contract C2).

The app decides what to suggest; the web decides whether a suggestion is valid (its schema, its repeat window).
The agent only checks the shape, so one bad suggestion or one failing app never stops the rest.
"""
from datetime import datetime
import logging
from typing import Any, Mapping

from ..client import CoreGatewayClient
from ..evidence import canonical_json, sha256_hex
from .common import Proposal, RuleRun, proposal, submit_rule_run

log = logging.getLogger("dxos_agent")

AGENT_PREFIX = "app:"
MAX_SUGGESTIONS = 10


def _proposal(app_id: str, actions: set[str], item: Any) -> Proposal:
    """The proposal for one suggestion; ValueError when its shape is wrong or its action is not one the app declares."""
    if not isinstance(item, Mapping):
        raise ValueError("not an object")
    action, payload, reason = item.get("action"), item.get("payload"), item.get("reason_vi")
    labels, subjects = item.get("labels") or {}, item.get("subjects") or []
    if action not in actions:
        raise ValueError(f"unknown action {action!r}")
    if not isinstance(payload, dict) or not isinstance(reason, str) or not reason.strip():
        raise ValueError("payload or reason_vi missing")
    if not (isinstance(labels, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in labels.items())):
        raise ValueError("labels must map strings to strings")
    if not (isinstance(subjects, list) and all(isinstance(s, str) for s in subjects)):
        raise ValueError("subjects must be strings")
    digest = sha256_hex(canonical_json(payload))  # raises on a non-integer number, as the evidence contract has no floats
    rows = [{"table": AGENT_PREFIX + app_id, "id": subject, "sha256": digest} for subject in subjects or [action]]
    return proposal(f"app.{app_id}.{action}", {**payload, **({"_labels": labels} if labels else {})}, reason, rows)


def run_app_suggestions(gateway: CoreGatewayClient, now: datetime) -> list[RuleRun]:
    """One run per app that has suggestions; an app that has none, or fails, leaves no run row."""
    del now
    runs: list[RuleRun] = []
    for app in gateway.get_enabled_apps():
        app_id, agent = app.get("id"), (app.get("manifest") or {}).get("agent")
        if not isinstance(agent, Mapping) or not agent.get("suggestions"):
            continue
        actions = {a["name"] for a in agent.get("actions") or [] if isinstance(a, Mapping) and "name" in a}
        try:
            items = gateway.get_app_suggestions(app_id, agent["suggestions"])[:MAX_SUGGESTIONS]
            proposals = []
            for item in items:
                try:
                    proposals.append(_proposal(app_id, actions, item))
                except (ValueError, TypeError) as exc:
                    log.warning("%s: suggestion skipped: %s", app_id, exc)
            run = submit_rule_run(gateway, AGENT_PREFIX + app_id, proposals, skip_statuses=(400,))
        except Exception:
            log.exception("%s: app suggestions failed", app_id)
            continue
        if run is not None:
            runs.append(run)
    return runs
