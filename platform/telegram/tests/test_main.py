# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Unit tests for the dxos-telegram M0 skeleton entrypoint and configuration."""
import threading

import pytest

from dxos_telegram import __main__ as telegram_main
from dxos_telegram.config import Config


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
    monkeypatch.setenv("DXOS_TELEGRAM_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(telegram_main.signal, "signal", lambda *a: None)
    return tmp_path / "hb"


def test_waits_interval_between_rounds_and_touches_heartbeat(env):
    stop = FakeStop(rounds=3)
    telegram_main.main(stop)
    assert stop.waits == [5.0, 5.0, 5.0]
    assert env.exists()


def test_sigterm_exits_cleanly(monkeypatch, tmp_path):
    handlers = []
    monkeypatch.setenv("DXOS_TELEGRAM_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(telegram_main.signal, "signal", lambda sig, h: handlers.append(h))

    done = threading.Event()
    t = threading.Thread(target=lambda: (telegram_main.main(), done.set()))
    t.start()
    while not handlers:
        pass
    handlers[0](15, None)
    assert done.wait(5), "main did not exit after SIGTERM"
    t.join()


def test_config_defaults_when_env_unset(monkeypatch):
    monkeypatch.delenv("DXOS_TELEGRAM_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("DXOS_HEARTBEAT_PATH", raising=False)
    cfg = Config.from_env()
    assert cfg.interval_seconds == 30.0
    assert cfg.heartbeat_path == "/tmp/dxos-telegram.heartbeat"
