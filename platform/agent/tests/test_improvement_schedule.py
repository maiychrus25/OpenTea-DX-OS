# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A10 schedule: Monday 06:30 Vietnam time, once per week; a 4xx refusal ends the week, any other failure is retried."""
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from dxos_agent import __main__ as agent_main
from dxos_agent.agents.improvement import ImprovementOutcome
from dxos_agent.client import AgentCredentials
from dxos_agent.providers import ReplayProvider
from dxos_agent.schedule import WeeklySchedule
from dxos_agent.settings import AgentSettings

VN = ZoneInfo("Asia/Ho_Chi_Minh")
CREDS = AgentCredentials(htx_code="TC01", client_id="agent-tc01", client_secret="secret")
MONDAY_0630_UTC = datetime(2026, 11, 29, 23, 30, tzinfo=timezone.utc)  # 06:30 on Monday 30 November in Vietnam


def _vn(day: int, hour: int, minute: int = 0, month: int = 11) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=VN)


def test_weekly_schedule_is_due_from_0630_on_monday_and_not_before():
    schedule = WeeklySchedule(time(6, 30))

    assert not schedule.is_due(_vn(30, 6, 29))
    assert schedule.is_due(_vn(30, 6, 30))


def test_first_cycle_after_start_later_in_the_week_is_due_at_once():
    assert WeeklySchedule(time(6, 30)).is_due(_vn(2, 9, 0, month=12))  # Wednesday 2 December


def test_recorded_week_is_not_due_again_until_the_next_monday():
    schedule = WeeklySchedule(time(6, 30))
    schedule.record(_vn(30, 7, 0))

    assert not schedule.is_due(_vn(2, 12, 0, month=12))
    assert not schedule.is_due(_vn(6, 23, 59, month=12))  # Sunday still belongs to the week of 30 November
    assert schedule.is_due(_vn(7, 6, 30, month=12))  # Monday 7 December


def test_a_week_that_was_not_recorded_is_due_again_on_the_next_cycle():
    schedule = WeeklySchedule(time(6, 30))

    assert schedule.is_due(_vn(30, 7, 0))
    assert schedule.is_due(_vn(30, 7, 30))  # nothing was recorded, so a failed run is retried


class _NoGateway:
    """The improvement run is replaced in every test, so the gateway is never called."""


def _runtime() -> agent_main._CooperativeRuntime:
    local_model = ReplayProvider(fixtures={"default": {"summary_vi": "Một việc."}})
    local_model.name = "ollama"
    return agent_main._CooperativeRuntime(creds=CREDS, gateway=_NoGateway(), providers={"ollama": local_model})


def _patch_other_agents(monkeypatch, calls: list[str]) -> None:
    def record(label: str):
        return lambda *args, **kwargs: calls.append(label)

    monkeypatch.setattr(agent_main.field_watch, "run_field_watch", record("A2"))
    monkeypatch.setattr(agent_main.harvest_ready, "run_harvest_ready", record("A4"))
    monkeypatch.setattr(agent_main.disease_watch, "fetch_window", lambda *a, **k: ([],))
    monkeypatch.setattr(agent_main.disease_watch, "window_fingerprint", lambda rows: "fp")
    monkeypatch.setattr(agent_main.disease_watch, "run_disease_watch", record("A3"))
    monkeypatch.setattr(agent_main.daily_campaign, "run_daily_campaign", record("A9"))
    monkeypatch.setattr(agent_main.bulletin, "run_bulletin", record("A5"))


def _patch_improvement(monkeypatch, calls: list[str], result: ImprovementOutcome | None = None, error: Exception | None = None) -> None:
    def run(gateway, now, providers):
        del gateway, now, providers
        calls.append("A10")
        if error is not None:
            raise error
        return result or ImprovementOutcome(status="done", run_id="run-1", proposed=0)

    monkeypatch.setattr(agent_main.improvement, "run_improvement", run)


def _join_bulletin(runtime: agent_main._CooperativeRuntime) -> None:
    if runtime.bulletin_thread is not None:
        runtime.bulletin_thread.join(5)


def test_a10_runs_on_monday_after_the_campaign_and_records_the_week(monkeypatch):
    calls: list[str] = []
    _patch_other_agents(monkeypatch, calls)
    _patch_improvement(monkeypatch, calls)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, MONDAY_0630_UTC, AgentSettings())
    _join_bulletin(runtime)

    assert calls.count("A10") == 1
    assert calls.index("A9") < calls.index("A10")
    assert runtime.improvement.last_week is not None


def test_a10_is_not_due_before_0630_on_monday(monkeypatch):
    calls: list[str] = []
    _patch_other_agents(monkeypatch, calls)
    _patch_improvement(monkeypatch, calls)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, _vn(30, 6, 29).astimezone(timezone.utc), AgentSettings())
    _join_bulletin(runtime)

    assert "A10" not in calls


def test_a10_failure_is_retried_on_the_next_cycle_and_does_not_stop_the_others(monkeypatch):
    calls: list[str] = []
    _patch_other_agents(monkeypatch, calls)
    _patch_improvement(monkeypatch, calls, error=ConnectionError("network down"))
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, MONDAY_0630_UTC, AgentSettings())
    agent_main._run_m4_agents(runtime, MONDAY_0630_UTC, AgentSettings())
    _join_bulletin(runtime)

    assert calls.count("A10") == 2
    assert "A9" in calls  # a failing A10 does not stop the campaign or the other agents
    assert runtime.improvement.last_week is None


def test_a10_refused_week_is_not_retried_on_the_next_cycle(monkeypatch):
    calls: list[str] = []
    _patch_other_agents(monkeypatch, calls)
    _patch_improvement(monkeypatch, calls, result=ImprovementOutcome(status="refused", run_id="run-1", proposed=0))
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, MONDAY_0630_UTC, AgentSettings())
    agent_main._run_m4_agents(runtime, MONDAY_0630_UTC, AgentSettings())
    _join_bulletin(runtime)

    assert calls.count("A10") == 1
    assert runtime.improvement.last_week is not None
