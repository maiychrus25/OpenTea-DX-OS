# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A11 (strategy): the rules set the targets from last year, the LLM only words priorities and initiatives."""
from datetime import date, datetime, time
import json
from pathlib import Path
from typing import Any, Mapping

import pytest
from zoneinfo import ZoneInfo

from dxos_agent import __main__ as agent_main
from dxos_agent.agents.strategy import StrategyOutcome, run_strategy, season_of
from dxos_agent.client import AgentCredentials, GatewayHTTPError
from dxos_agent.providers import ProviderError, ReplayProvider
from dxos_agent.schedule import SeasonSchedule
from dxos_agent.settings import AgentSettings

SCENARIOS = Path(__file__).parent / "scenarios"
NOW = datetime.fromisoformat("2026-10-01T00:00:00+00:00")  # 07:00 on 1 October in Vietnam: the first day of 2026-Q4


class StrategyGateway:
    """Serves the inputs and records the run and the plan the agent posts."""

    def __init__(self, inputs: Mapping[str, Any], post_answer: Mapping[str, Any] | None = None, post_error: Exception | None = None) -> None:
        self._inputs = dict(inputs)
        self._post_answer = dict(post_answer or {"id": "plan-1", "proposal_id": "prop-1"})
        self._post_error = post_error
        self.seasons: list[str] = []
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.posted: list[dict[str, Any]] = []

    def get_strategy_inputs(self, season: str) -> dict[str, Any]:
        self.seasons.append(season)
        return json.loads(json.dumps(self._inputs))

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def post_strategy_plan(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        if self._post_error is not None:
            raise self._post_error
        return dict(self._post_answer)


class FailingProvider(ReplayProvider):
    name = "anthropic"
    external = True

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("upstream unavailable")


class CountingProvider(ReplayProvider):
    def __init__(self) -> None:
        super().__init__(fixtures={"default": {"priorities": [], "initiatives": []}})
        self.calls = 0

    def _generate(self, messages, schema):
        self.calls += 1
        return super()._generate(messages, schema)


def _chain(case: Mapping[str, Any]) -> list[ReplayProvider]:
    if case.get("primary_error"):
        return [FailingProvider(fixtures={})]
    if "replay" in case:
        return [ReplayProvider(fixtures={"default": case["replay"]})]
    return []


def _cases() -> list[Any]:
    cases = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))
    return [pytest.param(case, id=case["name"]) for case in cases]


@pytest.mark.parametrize("case", _cases())
def test_scenario_case(case: dict[str, Any]) -> None:
    gateway = StrategyGateway(case["inputs"])

    outcome = run_strategy(gateway, NOW, _chain(case))

    expect = case["expect"]
    assert gateway.seasons == ["2026-Q4"]
    assert outcome.status == expect["status"]
    if expect["status"] != "posted":
        assert gateway.posted == [] and gateway.runs_started == []  # nothing to do: no run row and no LLM call
        return
    body = gateway.posted[0]
    assert body["season"] == "2026-Q4"
    assert body["run_id"] == "run-1"
    assert [[g["key"], g["target"], g["baseline"], g["direction"]] for g in body["goals"]] == expect["goals"]
    assert body["priorities"] == expect["priorities"]
    assert body["initiatives"] == expect["initiatives"]
    assert gateway.runs_finished[-1]["status"] == "ok"


def test_goal_carries_the_labels_the_web_shows() -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[0]
    gateway = StrategyGateway(case["inputs"])

    run_strategy(gateway, NOW, [])

    assert gateway.posted[0]["goals"][0] == {
        "key": "yield_kg", "label_vi": "Sản lượng", "unit_vi": "kg", "baseline": 1000, "target": 1050, "direction": "up",
    }
    assert gateway.posted[0]["goals"][2]["unit_vi"] == "%"


def test_the_llm_sees_only_the_figures_and_the_goals() -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[0]
    seen: list[str] = []
    provider = ReplayProvider(resolver=lambda messages, schema, key: seen.append(messages[-1].content) or {"priorities": ["a"], "initiatives": []})

    run_strategy(StrategyGateway(case["inputs"]), NOW, [provider])

    payload = json.loads(seen[0])
    assert set(payload) == {"season", "goals", "figures"}
    assert set(payload["figures"]) == {"current", "last_year", "previous"}


def test_a_skipped_season_makes_no_llm_call() -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[6]
    provider = CountingProvider()

    run_strategy(StrategyGateway(case["inputs"]), NOW, [provider])

    assert provider.calls == 0


def test_an_existing_draft_answer_is_reported_without_failing() -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[0]
    gateway = StrategyGateway(case["inputs"], post_answer={"existing": True})

    assert run_strategy(gateway, NOW, []).status == "existing"
    assert gateway.runs_finished[-1]["status"] == "ok"


@pytest.mark.parametrize("status", [400, 409, 422])
def test_refusal_ends_the_quarter_and_marks_the_run_failed(status: int) -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[0]
    gateway = StrategyGateway(case["inputs"], post_error=GatewayHTTPError(f"Gateway POST failed ({status}): STRATEGY_RANGE", status))

    outcome = run_strategy(gateway, NOW, [])

    assert outcome.status == "refused"
    assert gateway.runs_finished[-1]["status"] == "failed" and "STRATEGY_RANGE" in gateway.runs_finished[-1]["error"]


@pytest.mark.parametrize("error", [GatewayHTTPError("Gateway POST failed (500): boom", 500), GatewayHTTPError("Gateway POST failed (401): expired", 401), ConnectionError("down")])
def test_other_failures_are_raised_so_the_next_cycle_retries(error: Exception) -> None:
    case = json.loads((SCENARIOS / "a11_strategy.json").read_text(encoding="utf-8"))[0]
    gateway = StrategyGateway(case["inputs"], post_error=error)

    with pytest.raises(type(error)):
        run_strategy(gateway, NOW, [])
    assert gateway.runs_finished[-1]["status"] == "failed"


@pytest.mark.parametrize("day,season", [(date(2026, 1, 1), "2026-Q1"), (date(2026, 3, 31), "2026-Q1"), (date(2026, 4, 1), "2026-Q2"), (date(2026, 12, 31), "2026-Q4")])
def test_season_of(day: date, season: str) -> None:
    assert season_of(day) == season


def _vn(month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))


def test_season_schedule_first_cycle_is_due_at_any_hour_then_once_per_quarter() -> None:
    schedule = SeasonSchedule(time(6, 15))
    assert schedule.is_due(_vn(11, 20, 3))  # first cycle after start
    schedule.record(_vn(11, 20, 3))
    assert not schedule.is_due(_vn(12, 31, 23))


def test_season_schedule_new_quarter_is_due_from_0615_vietnam_time() -> None:
    schedule = SeasonSchedule(time(6, 15))
    schedule.record(_vn(9, 30, 12))

    assert not schedule.is_due(_vn(10, 1, 6, 14))
    assert schedule.is_due(_vn(10, 1, 6, 15))
    assert schedule.is_due(_vn(10, 3, 1))  # a quarter not recorded is due again, even on a later day


# --- the agent loop runs A11 on its own clock ---

class _NoGateway:
    """Every agent run is replaced in these tests, so the gateway is never called."""


def _runtime() -> agent_main._CooperativeRuntime:
    local_model = ReplayProvider(fixtures={"default": {"summary_vi": "Một việc."}})
    local_model.name = "ollama"
    creds = AgentCredentials(htx_code="TC01", client_id="agent-tc01", client_secret="secret")
    return agent_main._CooperativeRuntime(creds=creds, gateway=_NoGateway(), providers={"ollama": local_model})


def _run_cycle(monkeypatch, runtime, now, result=None, error=None) -> list[str]:
    calls: list[str] = []
    for module, name in ((agent_main.field_watch, "run_field_watch"), (agent_main.harvest_ready, "run_harvest_ready"),
                         (agent_main.disease_watch, "run_disease_watch"), (agent_main.daily_campaign, "run_daily_campaign"),
                         (agent_main.bulletin, "run_bulletin"), (agent_main.improvement, "run_improvement")):
        monkeypatch.setattr(module, name, lambda *a, **k: None)
    monkeypatch.setattr(agent_main.disease_watch, "fetch_window", lambda *a, **k: ([],))
    monkeypatch.setattr(agent_main.disease_watch, "window_fingerprint", lambda rows: "fp")

    def run(gateway, now, providers):
        del gateway, now, providers
        calls.append("A11")
        if error is not None:
            raise error
        return result or StrategyOutcome(status="posted", run_id="run-1", plan_id="plan-1")

    monkeypatch.setattr(agent_main.strategy, "run_strategy", run)
    agent_main._run_m4_agents(runtime, now, AgentSettings())
    if runtime.bulletin_thread is not None:
        runtime.bulletin_thread.join(5)
    return calls


def test_a11_runs_on_the_first_cycle_and_not_again_in_the_same_quarter(monkeypatch) -> None:
    runtime = _runtime()

    assert _run_cycle(monkeypatch, runtime, _vn(11, 20, 9)) == ["A11"]
    assert _run_cycle(monkeypatch, runtime, _vn(11, 21, 9)) == []


def test_a11_failure_is_retried_on_the_next_cycle(monkeypatch) -> None:
    runtime = _runtime()

    assert _run_cycle(monkeypatch, runtime, _vn(11, 20, 9), error=ConnectionError("down")) == ["A11"]
    assert runtime.strategy.last_season is None
    assert _run_cycle(monkeypatch, runtime, _vn(11, 20, 9, 5)) == ["A11"]


def test_a11_refused_quarter_is_not_retried(monkeypatch) -> None:
    runtime = _runtime()

    _run_cycle(monkeypatch, runtime, _vn(11, 20, 9), result=StrategyOutcome(status="refused", run_id="run-1", plan_id=None))

    assert _run_cycle(monkeypatch, runtime, _vn(11, 20, 9, 5)) == []
