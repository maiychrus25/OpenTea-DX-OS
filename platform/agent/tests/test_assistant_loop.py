# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The assistant thread (A-3): polling, isolation between cooperatives, provider choice and timeouts."""
from datetime import datetime, timezone

import pytest

from dxos_agent import __main__ as agent_main
from dxos_agent.agents.assistant import run_assistant_once
from dxos_agent.config import Config
from dxos_agent.providers import ProviderError, ReplayProvider
from dxos_agent.settings import AgentSettings

NOW = datetime(2026, 11, 26, 3, 0, tzinfo=timezone.utc)


class FakeGateway:
    """Stands in for CoreGatewayClient: the cycle only reads settings from it, and the fake `run_assistant_once` ignores it."""

    def __init__(self, gateway_url, token_provider) -> None:
        del gateway_url, token_provider

    def get_settings(self) -> dict:
        return {}


class StopAfter:
    """Stops after `cycles` checks of is_set(), so the loop runs exactly that many cycles."""

    def __init__(self, cycles: int) -> None:
        self.left = cycles

    def is_set(self) -> bool:
        if self.left == 0:
            return True
        self.left -= 1
        return False


class ExternalReplay(ReplayProvider):
    """Stands in for an external provider (Anthropic) that answers from a fixture."""

    name = "anthropic"
    external = True


def _write_creds(env_dir, htx: str) -> None:
    env_dir.mkdir(parents=True, exist_ok=True)
    (env_dir / f"{htx}.env").write_text(
        f"DXOS_AGENT_HTX={htx}\nDXOS_AGENT_CLIENT_ID=agent-{htx.lower()}\nDXOS_AGENT_CLIENT_SECRET=secret-{htx}\n",
        encoding="utf-8",
    )


@pytest.fixture
def cfg(tmp_path):
    return Config(interval_seconds=5, heartbeat_path=str(tmp_path / "hb"), env_dir=tmp_path / "env")


@pytest.fixture
def fake_gateway(monkeypatch):
    monkeypatch.setattr(agent_main, "CoreGatewayClient", FakeGateway)
    return FakeGateway


def test_poll_interval_is_one_and_a_half_seconds():
    assert agent_main.ASSISTANT_POLL_SECONDS == 1.5


def test_every_cooperative_is_polled_and_one_failure_does_not_stop_the_rest(monkeypatch, cfg, fake_gateway):
    _write_creds(cfg.env_dir, "TC01")
    _write_creds(cfg.env_dir, "TC02")
    calls: list = []

    def fake_once(gateway, providers, settings, now):
        del gateway, providers, settings, now
        calls.append("polled")
        if len(calls) == 1:
            raise RuntimeError("gateway down for the first cooperative")
        return 0

    monkeypatch.setattr(agent_main, "run_assistant_once", fake_once)

    agent_main.run_assistant_cycle(cfg, {}, NOW)

    assert calls == ["polled", "polled"]


def test_the_loop_runs_a_cycle_then_sleeps_the_poll_interval(monkeypatch, cfg):
    cycles: list = []
    slept: list = []
    monkeypatch.setattr(agent_main, "run_assistant_cycle", lambda cfg_, runtimes, now: cycles.append(now))
    monkeypatch.setattr(agent_main.time_module, "sleep", slept.append)

    agent_main._assistant_loop(cfg, {}, StopAfter(cycles=2))

    assert len(cycles) == 2
    assert slept == [1.5, 1.5]


def test_main_starts_the_assistant_as_a_daemon_thread(monkeypatch, tmp_path):
    started: list = []

    class SpyThread:
        def __init__(self, target, name=None, args=(), daemon=None) -> None:
            started.append({"target": target, "name": name, "daemon": daemon})

        def start(self) -> None:
            pass

    import threading

    monkeypatch.setenv("DXOS_AGENT_ENV_DIR", str(tmp_path / "none"))
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(agent_main.signal, "signal", lambda *a: None)
    monkeypatch.setattr(threading, "Thread", SpyThread)
    stop = threading.Event()
    stop.set()  # the main loop body does not run; only the thread start is under test

    agent_main.main(stop)

    assistant = [item for item in started if item["name"] == "assistant"]
    assert len(assistant) == 1
    assert assistant[0]["daemon"] is True
    assert assistant[0]["target"] is agent_main._assistant_loop


def test_assistant_uses_its_own_agent_choice_for_the_provider(cfg):
    settings = AgentSettings.from_payload(
        {"agents": {"assistant": {"provider": "anthropic", "model": "claude-x"}}, "budget": {"exhausted": False}}
    )
    answer = {"type": "unknown", "name": "", "args": {}}
    providers = {
        "ollama": ReplayProvider(fixtures={"default": answer}),
        "anthropic": ExternalReplay(fixtures={"default": answer}),
    }

    class OneRequest(FakeGateway):
        runs: list = []

        def claim_assistant_requests(self, limit):
            del limit
            return [{"id": "req-1", "text": "xin chào", "tools": [], "actions": []}]

        def start_run(self, **kwargs):
            self.runs.append(kwargs)
            return "run-1"

        def finish_run(self, run_id, status, **kwargs):
            del run_id, status, kwargs

        def post_assistant_result(self, request_id, intent, run_id):
            del request_id, intent, run_id
            return True

    gateway = OneRequest("", None)
    run_assistant_once(gateway, providers, settings, NOW)

    assert gateway.runs[0]["provider"] == "anthropic"


def test_busy_local_model_is_seen_as_busy_by_the_assistant(monkeypatch, cfg, fake_gateway):
    _write_creds(cfg.env_dir, "TC01")
    seen: list = []
    monkeypatch.setattr(agent_main, "run_assistant_once", lambda gateway, providers, settings, now: seen.append(providers))

    agent_main._bulletin_on_local_model.set()
    try:
        agent_main.run_assistant_cycle(cfg, {}, NOW)
    finally:
        agent_main._bulletin_on_local_model.clear()

    assert isinstance(seen[0]["ollama"], agent_main._LocalModelBusy)


def test_assistant_external_calls_time_out_at_45_seconds_and_a1_keeps_60(cfg, fake_gateway):
    cfg_with_key = Config(
        interval_seconds=5,
        heartbeat_path=cfg.heartbeat_path,
        env_dir=cfg.env_dir,
        anthropic_api_key="test-key",
    )
    from dxos_agent.client import AgentCredentials

    creds = AgentCredentials(htx_code="TC01", client_id="agent-tc01", client_secret="secret")
    assistant_runtime = agent_main._assistant_runtime_for(cfg_with_key, {}, creds)
    a1_runtime = agent_main._runtime_for(cfg_with_key, {}, creds)

    assert assistant_runtime.providers["anthropic"].timeout_seconds == 45.0
    assert assistant_runtime.providers["ollama"].timeout_seconds == 60.0
    assert a1_runtime.providers["anthropic"].timeout_seconds == 60.0


def test_a_failing_assistant_run_is_logged_and_not_raised_into_the_thread(monkeypatch, cfg, fake_gateway):
    _write_creds(cfg.env_dir, "TC01")

    def failing_once(gateway, providers, settings, now):
        del gateway, providers, settings, now
        raise ProviderError("LLM HTTP 500")

    monkeypatch.setattr(agent_main, "run_assistant_once", failing_once)

    agent_main.run_assistant_cycle(cfg, {}, NOW)  # must not raise
