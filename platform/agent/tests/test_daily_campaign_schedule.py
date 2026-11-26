# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The M7 schedule: A2, A4 and A3 run before A9 at 06:00, A9 runs before the bulletin, and a failing A9 stops nothing."""
from datetime import datetime, time, timezone

import pytest

from dxos_agent import __main__ as agent_main
from dxos_agent.client import AgentCredentials, GatewayHTTPError
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
    monkeypatch.setattr(agent_main.staff_tasks, "run_staff_tasks", record("A8"))
    monkeypatch.setattr(agent_main.bulletin, "run_bulletin", record("A5"))
    if campaign_error is None:
        monkeypatch.setattr(agent_main.daily_campaign, "run_daily_campaign", record("A9", result=None))
    else:
        monkeypatch.setattr(agent_main.daily_campaign, "run_daily_campaign", failing_campaign)


class CampaignRetryGateway:
    """Serves one open proposal and refuses the campaign POST with `post_error`; counts the candidate reads."""

    def __init__(self, post_error: Exception) -> None:
        self._post_error = post_error
        self.candidate_reads = 0
        self.run_count = 0

    def get_campaign_candidates(self, day: str) -> dict:
        del day
        self.candidate_reads += 1
        return {
            "day": "2026-11-27",
            "proposals": [{
                "id": "n1", "kind": "notification.internal", "risk": "low", "title_vi": "Gửi thông báo cán bộ",
                "created_at": "2026-11-20T00:00:00Z", "parcel_codes": [], "goal_key": "internal_notice",
                "target": 1, "involves_spraying": False, "people_needed": 0,
            }],
            "rain_parcel_codes": [], "withdrawal_parcel_codes": [], "people_available": None,
        }

    def start_run(self, **kwargs) -> str:
        del kwargs
        self.run_count += 1
        return f"run-{self.run_count}"

    def finish_run(self, run_id, status, **kwargs) -> None:
        del run_id, status, kwargs

    def post_campaign(self, body) -> dict:
        del body
        raise self._post_error


def _patch_others(monkeypatch, calls: list[str]) -> None:
    """Patch A2, A4, A3 and A5 only, so the real A9 runs against the fake gateway."""
    monkeypatch.setattr(agent_main.field_watch, "run_field_watch", lambda *a, **k: calls.append("A2"))
    monkeypatch.setattr(agent_main.harvest_ready, "run_harvest_ready", lambda *a, **k: calls.append("A4"))
    monkeypatch.setattr(agent_main.disease_watch, "fetch_window", lambda *a, **k: ([],))
    monkeypatch.setattr(agent_main.disease_watch, "window_fingerprint", lambda rows: "fp")
    monkeypatch.setattr(agent_main.disease_watch, "run_disease_watch", lambda *a, **k: calls.append("A3"))
    monkeypatch.setattr(agent_main.staff_tasks, "run_staff_tasks", lambda *a, **k: calls.append("A8"))
    monkeypatch.setattr(agent_main.bulletin, "run_bulletin", lambda *a, **k: calls.append("A5"))


def _runtime_with(gateway) -> agent_main._CooperativeRuntime:
    local_model = ReplayProvider(fixtures={"default": {"summary_vi": "Một việc."}})
    local_model.name = "ollama"
    return agent_main._CooperativeRuntime(creds=CREDS, gateway=gateway, providers={"ollama": local_model})


@pytest.mark.parametrize("status", [400, 409, 422])
def test_refused_campaign_post_is_not_retried_on_the_next_cycle(monkeypatch, status):
    _patch_others(monkeypatch, [])
    gateway = CampaignRetryGateway(GatewayHTTPError(f"Gateway POST failed ({status}): refused", status))
    runtime = _runtime_with(gateway)

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    agent_main._run_m4_agents(runtime, NOW, AgentSettings())  # next cycle, same day

    assert gateway.candidate_reads == 1
    assert runtime.daily_campaign.last_day is not None  # the day's schedule is done


@pytest.mark.parametrize("status", [401, 403, 404])
def test_other_client_errors_are_retried_on_the_next_cycle(monkeypatch, status):
    _patch_others(monkeypatch, [])
    gateway = CampaignRetryGateway(GatewayHTTPError(f"Gateway POST failed ({status}): try again", status))
    runtime = _runtime_with(gateway)

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    agent_main._run_m4_agents(runtime, NOW, AgentSettings())

    assert gateway.candidate_reads == 2
    assert runtime.daily_campaign.last_day is None  # not recorded: a fresh token may succeed next cycle


@pytest.mark.parametrize(
    "error",
    [GatewayHTTPError("Gateway POST failed (500): boom", 500), ConnectionError("network down")],
    ids=["server-error", "network-error"],
)
def test_server_or_network_failure_is_retried_on_the_next_cycle(monkeypatch, error):
    _patch_others(monkeypatch, [])
    gateway = CampaignRetryGateway(error)
    runtime = _runtime_with(gateway)

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    agent_main._run_m4_agents(runtime, NOW, AgentSettings())

    assert gateway.candidate_reads == 2
    assert runtime.daily_campaign.last_day is None


def _join_bulletin(runtime: agent_main._CooperativeRuntime) -> None:
    if runtime.bulletin_thread is not None:
        runtime.bulletin_thread.join(5)


def test_m7_daily_times_are_a4_530_a3_540_a8_550_and_a9_600():
    assert agent_main.HARVEST_READY_AT == time(5, 30)
    assert agent_main.DISEASE_WATCH_AT == time(5, 40)
    assert agent_main.STAFF_TASKS_AT == time(5, 50)
    assert _runtime().staff_tasks.at == time(5, 50)
    assert agent_main.CAMPAIGN_AT == time(6, 0)
    assert _runtime().daily_campaign.at == time(6, 0)


def test_a9_runs_after_a2_a4_and_a3_and_before_the_bulletin(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls == ["A2", "A4", "A3", "A8", "A9", "A5"]


def test_a9_failure_does_not_stop_the_bulletin(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls, campaign_error=RuntimeError("web refused the campaign"))
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls == ["A2", "A4", "A3", "A8", "A9", "A5"]
    assert runtime.daily_campaign.last_day is None  # not recorded, so the run is retried in the next cycle


def test_a8_failure_does_not_stop_a9_and_is_retried(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls)

    def failing(*args, **kwargs):
        del args, kwargs
        calls.append("A8")
        raise GatewayHTTPError("Gateway GET failed (500): boom", 500)

    monkeypatch.setattr(agent_main.staff_tasks, "run_staff_tasks", failing)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls == ["A2", "A4", "A3", "A8", "A9", "A5"]
    assert runtime.staff_tasks.last_day is None  # not recorded, so the run is retried in the next cycle


def test_a8_runs_once_per_vietnam_day(monkeypatch):
    calls: list[str] = []
    _patch_m4(monkeypatch, calls)
    runtime = _runtime()

    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    agent_main._run_m4_agents(runtime, NOW, AgentSettings())
    _join_bulletin(runtime)

    assert calls.count("A8") == 1
