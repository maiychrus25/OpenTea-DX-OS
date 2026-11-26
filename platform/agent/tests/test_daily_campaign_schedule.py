# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The M7 schedule: A2, A4 and A3 run before A9 at 06:00, A9 runs before the bulletin, and a failing A9 stops nothing."""
from datetime import datetime, time, timezone

from dxos_agent import __main__ as agent_main
from dxos_agent.client import AgentCredentials
from dxos_agent.providers import ReplayProvider
from dxos_agent.settings import AgentSettings

CREDS = AgentCredentials(htx_code="TC01", client_id="agent-tc01", client_secret="secret")
NOW = datetime(2026, 11, 27, 0, 0, tzinfo=timezone.utc)  # 07:00 on 27 November in Vietnam


def _runtime() -> agent_main._CooperativeRuntime:
    local_model = ReplayProvider(fixtures={})
    local_model.name = "ollama"  # the bulletin and A9 check the local model by name
    return agent_main._CooperativeRuntime(creds=CREDS, gateway=None, providers={"ollama": local_model})


def _patch_m4(monkeypatch, calls: list[str], campaign_error: Exception | None = None) -> None:
    def record(label: str, result=None):
        def run(*args, **kwargs):
            del args, kwargs
            calls.append(label)
            return result
        return run

    def failing_campaign(*args, **kwargs):
        del args, kwargs
        calls.append("A9")
        raise campaign_error

    monkeypatch.setattr(agent_main.field_watch, "run_field_watch", record("A2"))
    monkeypatch.setattr(agent_main.harvest_ready, "run_harvest_ready", record("A4"))
    monkeypatch.setattr(agent_main.disease_watch, "fetch_window", lambda *a, **k: ([],))
    monkeypatch.setattr(agent_main.disease_watch, "window_fingerprint", lambda rows: "fp")
    monkeypatch.setattr(agent_main.disease_watch, "run_disease_watch", record("A3"))
    monkeypatch.setattr(agent_main.bulletin, "run_bulletin", record("A5"))
    if campaign_error is None:
        monkeypatch.setattr(agent_main.daily_campaign, "run_daily_campaign", record("A9", result=None))
    else:
        monkeypatch.setattr(agent_main.daily_campaign, "run_daily_campaign", failing_campaign)


def _join_bulletin(runtime: agent_main._CooperativeRuntime) -> None:
    if runtime.bulletin_thread is not None:
        runtime.bulletin_thread.join(5)


def test_m7_daily_times_are_a4_530_a3_540_and_a9_600():
    assert agent_main.HARVEST_READY_AT == time(5, 30)
    assert agent_main.DISEASE_WATCH_AT == time(5, 40)
    assert agent_main.CAMPAIGN_AT == time(6, 0)
    assert _runtime().daily_campaign.at == time(6, 0)


def test_a9_runs_after_a2_a4_and_a3_and_before_the_bulletin(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls == ["A2", "A4", "A3", "A9", "A5"]


def test_a9_failure_does_not_stop_the_bulletin(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls, campaign_error=RuntimeError("web refused the campaign"))
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls == ["A2", "A4", "A3", "A9", "A5"]
    assert runtime.daily_campaign.last_day is None  # not recorded, so the run is retried in the next cycle
