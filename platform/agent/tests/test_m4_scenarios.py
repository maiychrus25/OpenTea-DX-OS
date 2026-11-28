# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scenario tests for the M4 agents (contract C8): fixed GraphQL rows in, the submitted proposals out."""
from datetime import datetime
import json
from pathlib import Path
import re
from typing import Any, Callable, Mapping

import pytest

from dxos_agent.agents.bulletin import run_bulletin
from dxos_agent.agents.cross_check import run_cross_check
from dxos_agent.agents.disease_watch import run_disease_watch
from dxos_agent.agents.field_watch import run_field_watch
from dxos_agent.agents.harvest_ready import run_harvest_ready
from dxos_agent.providers import ProviderError, ReplayProvider

SCENARIOS = Path(__file__).parent / "scenarios"
OPERATION = re.compile(r"\s*query\s+(\w+)")


def _subjects(kind: str, payload: Mapping[str, Any]) -> list[str]:
    """The subjects the web derives from a payload (contract C4); the agent does not send them."""
    if kind in ("notification.internal", "notification.households"):
        return list(payload["subjects"])
    if kind == "disease.inspection":
        return list(payload["report_ids"])
    if kind == "harvest.approve":
        return [payload["parcel_id"]]
    if kind == "bulletin.publish":
        return [f"{payload['commodity']}:{payload['period_day']}"]
    raise AssertionError(f"unknown kind {kind}")


class ScenarioGateway:
    """Serves each GraphQL operation from the case and records the runs and proposals the agent submits."""

    def __init__(self, data: Mapping[str, Any]) -> None:
        self._data = data
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.proposals: list[dict[str, Any]] = []

    def graphql(self, query: str, variables: Mapping[str, Any] | None = None) -> dict[str, Any]:
        del variables
        # KeyError when the case does not supply an operation the agent reads.
        return dict(self._data[OPERATION.match(query).group(1)])

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def submit_proposal(self, proposal: Mapping[str, Any]) -> dict[str, Any]:
        self.proposals.append(dict(proposal))
        return {"id": f"p-{len(self.proposals)}", "deduped": False}


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


class FailingExternal(ReplayProvider):
    """An external provider whose every call fails, as when its key or network is down."""

    name = "anthropic"
    external = True

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("upstream unavailable")


class OllamaReplay(ReplayProvider):
    """The internal fallback, served from the case's replay response."""

    name = "ollama"


def _run_bulletin(gateway: ScenarioGateway, case: dict[str, Any]) -> Any:
    fixtures = {"default": case.get("replay_response", {})}
    if case.get("primary_error"):
        return run_bulletin(
            gateway, _parse(case["now"]), FailingExternal(fixtures=fixtures), case.get("thresholds"), OllamaReplay(fixtures=fixtures)
        )
    return run_bulletin(gateway, _parse(case["now"]), ReplayProvider(fixtures=fixtures), case.get("thresholds"))


RUNNERS: dict[str, Callable[[ScenarioGateway, dict[str, Any]], Any]] = {
    "a5_bulletin.json": _run_bulletin,
    "a2_field_watch.json": lambda gateway, case: run_field_watch(
        gateway, _parse(case["now"]), case.get("thresholds")
    ),
    "a3_disease_watch.json": lambda gateway, case: run_disease_watch(
        gateway, _parse(case["now"]), case.get("thresholds")
    ),
    "a4_harvest_ready.json": lambda gateway, case: run_harvest_ready(
        gateway, _parse(case["now"]), case.get("thresholds")
    ),
    "a13_cross_check.json": lambda gateway, case: run_cross_check(
        gateway, _parse(case["now"]), case.get("thresholds")
    ),
}


def _order(item: Mapping[str, Any]) -> tuple[str, list[str]]:
    return item["kind"], item["subjects"]


def _cases() -> list[Any]:
    params = []
    for file_name in RUNNERS:
        for case in json.loads((SCENARIOS / file_name).read_text(encoding="utf-8")):
            params.append(pytest.param(file_name, case, id=f"{file_name}::{case['name']}"))
    return params


@pytest.mark.parametrize(("file_name", "case"), _cases())
def test_scenario_case(file_name: str, case: dict[str, Any]) -> None:
    gateway = ScenarioGateway(case["graphql"])
    RUNNERS[file_name](gateway, case)

    submitted = [
        {"kind": item["kind"], "subjects": _subjects(item["kind"], item["payload"]), "payload": item["payload"]}
        for item in gateway.proposals
    ]
    expected = case["expected"]["proposals"]
    assert sorted(submitted, key=_order) == sorted(expected, key=_order)

    if expected:
        assert len(gateway.runs_started) == 1
        assert gateway.runs_finished[-1]["status"] == "ok"
    else:
        # No proposal means no run row, or a run recorded as skipped.
        assert all(run["status"] == "skipped" for run in gateway.runs_finished)
        assert len(gateway.runs_started) == len(gateway.runs_finished)
