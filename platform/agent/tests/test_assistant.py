# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scenario tests for Agent A7 (assistant): one sentence in, one intent out (contract C7)."""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import pytest

from dxos_agent.agents.assistant import run_assistant_once
from dxos_agent.providers import ProviderError, ReplayProvider
from dxos_agent.settings import AgentSettings

SCENARIOS = Path(__file__).parent / "scenarios" / "a7_assistant.json"
NOW = datetime(2026, 11, 26, 3, 0, tzinfo=timezone.utc)


class ScenarioGateway:
    """Hands out the claimed requests and records the runs and results the agent sends."""

    def __init__(self, requests: list[dict[str, Any]]) -> None:
        self._requests = list(requests)
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.results: list[dict[str, Any]] = []

    def claim_assistant_requests(self, limit: int) -> list[dict[str, Any]]:
        claimed, self._requests = self._requests[:limit], self._requests[limit:]
        return claimed

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def post_assistant_result(self, request_id: str, intent: dict[str, Any], run_id: str | None) -> bool:
        self.results.append({"request_id": request_id, "intent": intent, "run_id": run_id})
        return True


class FailingProvider(ReplayProvider):
    """The internal model is down: every call raises a provider error."""

    name = "ollama"

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("LLM HTTP 500")


class ForbiddenProvider(ReplayProvider):
    """Must never be called: an empty claim makes no LLM call."""

    name = "ollama"

    def _generate(self, messages, schema):
        raise AssertionError("no LLM call expected")


def _cases() -> list[Any]:
    return [pytest.param(case, id=case["name"]) for case in json.loads(SCENARIOS.read_text(encoding="utf-8"))]


@pytest.mark.parametrize("case", _cases())
def test_assistant_case(case: dict[str, Any]) -> None:
    gateway = ScenarioGateway([case["request"]])
    if case.get("provider_error"):
        provider = FailingProvider()
    else:
        provider = ReplayProvider(fixtures={"default": case["replay_response"]})

    handled = run_assistant_once(gateway, {"ollama": provider}, AgentSettings(), NOW)

    assert handled == 1
    assert gateway.results == [
        {"request_id": case["request"]["id"], "intent": case["expected"]["intent"], "run_id": "run-1"}
    ]
    assert [run["status"] for run in gateway.runs_finished] == [case["expected"]["run_status"]]


def test_each_request_is_one_assistant_message_run():
    case = json.loads(SCENARIOS.read_text(encoding="utf-8"))[0]
    gateway = ScenarioGateway([case["request"]])

    run_assistant_once(gateway, {"ollama": ReplayProvider(fixtures={"default": case["replay_response"]})}, AgentSettings(), NOW)

    assert len(gateway.runs_started) == 1
    assert gateway.runs_started[0]["agent"] == "assistant"
    assert gateway.runs_started[0]["trigger"] == "message"


def test_empty_claim_makes_no_run_and_no_llm_call():
    gateway = ScenarioGateway([])

    handled = run_assistant_once(gateway, {"ollama": ForbiddenProvider()}, AgentSettings(), NOW)

    assert handled == 0
    assert gateway.runs_started == []
    assert gateway.results == []
