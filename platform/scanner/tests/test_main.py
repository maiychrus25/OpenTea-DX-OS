# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import threading
from types import SimpleNamespace

import pytest

from dxos_scanner import __main__ as scanner_main


class FakeStop:
    """Stands in for threading.Event: records waits and stops after `rounds` waits."""

    def __init__(self, rounds):
        self.rounds = rounds
        self.waits = []
        self._set = False

    def is_set(self):
        return self._set

    def set(self):
        self._set = True

    def wait(self, timeout):
        self.waits.append(timeout)
        if len(self.waits) >= self.rounds:
            self._set = True


@pytest.fixture
def env(monkeypatch, tmp_path):
    for k, v in {
        "MINIO_ACCESS_KEY": "a", "MINIO_SECRET_KEY": "s", "DXOS_DB_URL": "postgresql://x",
        "DXOS_SCAN_INTERVAL_SECONDS": "5", "DXOS_HEARTBEAT_PATH": str(tmp_path / "hb"),
    }.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(scanner_main, "Minio", lambda *a, **k: object())
    monkeypatch.setattr(scanner_main.signal, "signal", lambda *a: None)
    return tmp_path / "hb"


def test_waits_interval_between_rounds_and_touches_heartbeat(monkeypatch, env):
    rounds = []
    monkeypatch.setattr(scanner_main.psycopg, "connect", lambda *a, **k: SimpleNamespace(closed=False, close=lambda: None))
    monkeypatch.setattr(scanner_main, "run_once", lambda *a, **k: rounds.append(1) or 0)
    stop = FakeStop(rounds=3)
    scanner_main.main(stop)
    assert stop.waits == [5.0, 5.0, 5.0]
    assert len(rounds) == 3
    assert env.exists()


def test_db_connect_failure_waits_before_retrying(monkeypatch, env):
    attempts = []

    def boom(*a, **k):
        attempts.append(1)
        raise OSError("db down")

    monkeypatch.setattr(scanner_main.psycopg, "connect", boom)
    monkeypatch.setattr(scanner_main, "run_once", lambda *a, **k: pytest.fail("no db, no round"))
    stop = FakeStop(rounds=3)
    scanner_main.main(stop)
    assert len(attempts) == 3 and stop.waits == [5.0, 5.0, 5.0]
    assert not env.exists()  # failed rounds do not refresh the heartbeat


def test_sigterm_exits_cleanly_after_current_round(monkeypatch, env):
    handlers = []
    monkeypatch.setattr(scanner_main.signal, "signal", lambda sig, h: handlers.append(h))
    monkeypatch.setattr(scanner_main.psycopg, "connect", lambda *a, **k: SimpleNamespace(closed=False, close=lambda: None))
    calls = []

    def one_round(*a, **k):
        calls.append(1)
        handlers[0](15, None)  # SIGTERM arrives mid-round
        return 0

    monkeypatch.setattr(scanner_main, "run_once", one_round)
    done = threading.Event()
    t = threading.Thread(target=lambda: (scanner_main.main(), done.set()))
    t.start()
    assert done.wait(5), "main did not exit after SIGTERM"
    t.join()
    assert len(calls) == 1
