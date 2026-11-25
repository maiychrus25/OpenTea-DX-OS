# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Unit tests for the dxos-agent M0 skeleton entrypoint and configuration."""
from datetime import datetime, timedelta, timezone
import email.message
import io
import threading
import urllib.error

import pytest

from dxos_agent import __main__ as agent_main
from dxos_agent.config import Config
from dxos_agent.providers import OllamaProvider


class FakeStop:
    """Stands in for threading.Event: records waits and stops after `rounds` waits."""

    def __init__(self, rounds: int) -> None:
        self.rounds = rounds
        self.waits: list[float] = []
        self._set = False

    def is_set(self) -> bool:
        return self._set

    def set(self) -> None:
        self._set = True

    def wait(self, timeout: float) -> None:
        self.waits.append(timeout)
        if len(self.waits) >= self.rounds:
            self._set = True


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("DXOS_AGENT_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(agent_main.signal, "signal", lambda *a: None)
    return tmp_path / "hb"


def test_waits_interval_between_rounds_and_touches_heartbeat(env):
    stop = FakeStop(rounds=3)
    agent_main.main(stop)
    assert stop.waits == [5.0, 5.0, 5.0]
    assert env.exists()


def test_sigterm_exits_cleanly(monkeypatch, tmp_path):
    handlers = []
    monkeypatch.setenv("DXOS_AGENT_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(agent_main.signal, "signal", lambda sig, h: handlers.append(h))

    done = threading.Event()
    t = threading.Thread(target=lambda: (agent_main.main(), done.set()))
    t.start()
    while not handlers:
        pass
    handlers[0](15, None)
    assert done.wait(5), "main did not exit after SIGTERM"
    t.join()


def test_config_defaults_when_env_unset(monkeypatch):
    monkeypatch.delenv("DXOS_AGENT_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("DXOS_HEARTBEAT_PATH", raising=False)
    cfg = Config.from_env()
    assert cfg.interval_seconds == 30.0
    assert cfg.heartbeat_path == "/tmp/dxos-agent.heartbeat"


CREDS_ENV = "DXOS_AGENT_HTX=TC01\nDXOS_AGENT_CLIENT_ID=agent-tc01\nDXOS_AGENT_CLIENT_SECRET=s3cret\n"


def _clean_entry(entry_id: str) -> dict:
    return {
        "id": entry_id,
        "parcel_id": "pc_t",
        "entry_date": "2026-11-15T01:30:00",
        "activity_type": "FERTILIZING",
        "status": "PENDING_APPROVAL",
        "notes": None,
        "updated_at": "2026-11-15T02:00:00",
        "weather_precipitation": 0.0,
        "parcel": {"id": "pc_t", "parcel_code": "TC-T", "crop_cycles": []},
        "activities": [
            {"id": f"{entry_id}_a", "activity_detail": "Bón", "product_name": "NPK", "dosage": "10 kg",
             "withdrawal_days": None, "safe_harvest_date": None}
        ],
    }


def _flagged_entry(entry_id: str) -> dict:
    """A fertilizing entry with an implausible dosage: the rules flag it, so the LLM is consulted."""
    entry = _clean_entry(entry_id)
    entry["activities"][0]["dosage"] = "1200 kg"
    return entry


class FakeHasuraGateway:
    """Gateway stand-in: serves the queue and records runs and proposals."""

    def __init__(self, entries: list[dict]) -> None:
        self.entries = entries
        self.runs_started = 0
        self.proposals: list[dict] = []
        self.heartbeats: list[str] = []

    def graphql(self, query, variables=None):
        del query, variables
        return {"journal_entries": self.entries}

    def get_settings(self):
        return {}

    def heartbeat(self, version, providers):
        del providers
        self.heartbeats.append(version)

    def start_run(self, **kwargs):
        del kwargs
        self.runs_started += 1
        return f"run-{self.runs_started}"

    def finish_run(self, run_id, status, **kwargs):
        del run_id, status, kwargs

    def submit_proposal(self, proposal):
        self.proposals.append(proposal)
        return {"deduped": False}


class FakeTokenClient:
    constructed = 0

    def __init__(self, keycloak_url, creds, **kwargs):
        del keycloak_url, creds, kwargs
        FakeTokenClient.constructed += 1

    def get_token(self):
        return "token"


@pytest.fixture
def cooperative(monkeypatch, tmp_path):
    env_dir = tmp_path / "env"
    env_dir.mkdir()
    (env_dir / "tc01.env").write_text(CREDS_ENV, encoding="utf-8")
    FakeTokenClient.constructed = 0
    gateway = FakeHasuraGateway([])
    monkeypatch.setattr(agent_main, "KeycloakTokenClient", FakeTokenClient)
    monkeypatch.setattr(agent_main, "CoreGatewayClient", lambda *a, **k: gateway)
    cfg = Config(interval_seconds=5.0, heartbeat_path=str(tmp_path / "hb"), env_dir=env_dir)
    return cfg, gateway


def test_heartbeat_is_sent_at_most_every_five_minutes(cooperative):
    cfg, gateway = cooperative
    runtimes: dict = {}
    t0 = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)

    agent_main.run_once(cfg, runtimes, now=t0)
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=4))
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=5))

    assert gateway.heartbeats == [agent_main.__version__, agent_main.__version__]


def test_empty_queue_creates_no_run_and_the_token_client_is_reused(cooperative):
    cfg, gateway = cooperative
    runtimes: dict = {}
    t0 = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)

    agent_main.run_once(cfg, runtimes, now=t0)
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=1))

    assert gateway.runs_started == 0
    assert FakeTokenClient.constructed == 1


def test_run_happens_on_first_cycle_when_queue_changes_and_hourly_in_working_hours(cooperative):
    cfg, gateway = cooperative
    runtimes: dict = {}
    t0 = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)  # 10:00 Vietnam time
    gateway.entries = [_clean_entry("je_1")]

    agent_main.run_once(cfg, runtimes, now=t0)  # first cycle
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=1))  # unchanged
    assert gateway.runs_started == 1

    gateway.entries.append(_clean_entry("je_2"))
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=2))  # queue changed
    assert gateway.runs_started == 2

    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=62))  # unchanged, an hour later, daytime
    assert gateway.runs_started == 3


def test_hourly_run_is_skipped_at_night(cooperative):
    cfg, gateway = cooperative
    runtimes: dict = {}
    night = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)  # 22:00 Vietnam time
    gateway.entries = [_clean_entry("je_1")]

    agent_main.run_once(cfg, runtimes, now=night)
    agent_main.run_once(cfg, runtimes, now=night + timedelta(hours=2))

    assert gateway.runs_started == 1


def test_rate_limited_cooperative_keeps_rule_proposals_never_sleeps_and_heartbeat_keeps_touching(
    monkeypatch, cooperative, tmp_path
):
    cfg, gateway = cooperative
    gateway.entries = [_flagged_entry("je_1")]
    urlopen_calls = []
    sleeps = []

    def always_429(req, timeout):
        del timeout
        urlopen_calls.append(req.full_url)
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", email.message.Message(), io.BytesIO(b""))

    def build_providers(_cfg, token_client):
        del token_client
        return {
            "ollama": OllamaProvider(
                gateway_url=cfg.gateway_url,
                token_provider=lambda: "token",
                sleep_fn=sleeps.append,
                urlopen_fn=always_429,
            )
        }

    monkeypatch.setattr(agent_main, "_build_providers", build_providers)
    stop = _RoundsStop(rounds=2, on_wait=lambda: gateway.entries.append(_flagged_entry("je_2")))
    monkeypatch.setattr(agent_main.signal, "signal", lambda *a: None)
    monkeypatch.setenv("DXOS_AGENT_ENV_DIR", str(cfg.env_dir))
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", cfg.heartbeat_path)
    monkeypatch.setenv("DXOS_AGENT_INTERVAL_SECONDS", "5")

    agent_main.main(stop)

    assert sleeps == []
    assert len(urlopen_calls) == 1  # the second cycle is blocked by the cool-down, no HTTP request
    assert [p["kind"] for p in gateway.proposals] == ["journal.reject"] * 3  # rule-only reasons throughout
    assert all("bất thường" in p["reason_vi"] for p in gateway.proposals)
    assert (tmp_path / "hb").exists()


def test_one_failing_m4_agent_does_not_stop_the_others_or_a1(monkeypatch, cooperative):
    cfg, gateway = cooperative
    gateway.entries = [_clean_entry("je_1")]
    harvest_runs = []

    def failing_field_watch(*args, **kwargs):
        del args, kwargs
        raise RuntimeError("field watch broke")

    monkeypatch.setattr(agent_main.field_watch, "run_field_watch", failing_field_watch)
    monkeypatch.setattr(agent_main.harvest_ready, "run_harvest_ready", lambda *a, **k: harvest_runs.append(a))

    agent_main.run_once(cfg, {}, now=datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc))

    assert len(harvest_runs) == 1
    assert [p["kind"] for p in gateway.proposals] == ["journal.approve"]


def test_disease_watch_runs_on_first_cycle_on_a_changed_window_and_once_a_day(monkeypatch, cooperative):
    cfg, gateway = cooperative
    reports = [
        {"id": "dr-1", "parcel_id": "pc_1", "status": "PENDING", "detection_date": "2026-11-24T00:00:00+00:00",
         "ai_disease_name": "helopeltis", "confirmed_diagnosis": None, "updated_at": "2026-11-24T00:00:00+00:00"}
    ]
    gateway.graphql = lambda query, variables=None: {"disease_reports": reports, "parcels": []}
    calls = []
    monkeypatch.setattr(agent_main.disease_watch, "run_disease_watch", lambda *a, **k: calls.append(a[1]))
    runtimes: dict = {}  # one runtime across cycles, as the loop keeps it
    t0 = datetime(2026, 11, 24, 0, 30, tzinfo=timezone.utc)  # 07:30 Vietnam time

    agent_main.run_once(cfg, runtimes, now=t0)  # first cycle
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=1))  # unchanged, same day
    assert len(calls) == 1

    reports.append({"id": "dr-2", "parcel_id": "pc_2", "status": "PENDING", "detection_date": "2026-11-24T00:50:00+00:00",
                    "ai_disease_name": "helopeltis", "confirmed_diagnosis": None, "updated_at": "2026-11-24T00:50:00+00:00"})
    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(minutes=2))  # the window changed
    assert len(calls) == 2

    agent_main.run_once(cfg, runtimes, now=t0 + timedelta(days=1, minutes=10))  # next day, 07:40, unchanged
    assert len(calls) == 3


class _RoundsStop:
    """Stop event that runs a hook between cycles and stops after `rounds` waits."""

    def __init__(self, rounds: int, on_wait) -> None:
        self.rounds = rounds
        self.on_wait = on_wait
        self.waits = 0
        self._set = False

    def is_set(self) -> bool:
        return self._set

    def set(self) -> None:
        self._set = True

    def wait(self, timeout: float) -> None:
        del timeout
        self.waits += 1
        self.on_wait()
        if self.waits >= self.rounds:
            self._set = True
