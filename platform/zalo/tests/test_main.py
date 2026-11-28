# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The service idles and stays healthy until the client credentials exist; config and entrypoint behave like dxos-telegram."""
import threading

from dxos_zalo import __main__ as zalo_main
from dxos_zalo.config import Config


class FakeStop:
    def __init__(self, rounds: int) -> None:
        self.rounds, self.waits, self._set = rounds, [], False

    def is_set(self) -> bool:
        return self._set

    def set(self) -> None:
        self._set = True

    def wait(self, timeout: float) -> None:
        self.waits.append(timeout)
        if len(self.waits) >= self.rounds:
            self._set = True


def make_config(tmp_path):
    return Config(interval_seconds=30, heartbeat_path=str(tmp_path / "hb"), env_dir=tmp_path)


def test_no_credentials_file_means_idle_but_heartbeat_keeps_beating(monkeypatch, tmp_path):
    monkeypatch.setenv("DXOS_ZALO_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setenv("DXOS_ZALO_ENV_DIR", str(tmp_path))
    monkeypatch.setattr(zalo_main.signal, "signal", lambda *a: None)
    stop = FakeStop(rounds=3)
    zalo_main.main(stop)
    assert stop.waits == [5.0, 5.0, 5.0]
    assert (tmp_path / "hb").exists()
    assert zalo_main.start_relay(make_config(tmp_path)) is None


def test_incomplete_credentials_means_idle(tmp_path):
    (tmp_path / "zalo.env").write_text("DXOS_ZALO_CLIENT_ID=a\n")
    assert zalo_main.start_relay(make_config(tmp_path)) is None


def test_complete_credentials_start_the_relay(tmp_path, monkeypatch):
    (tmp_path / "zalo.env").write_text("DXOS_ZALO_CLIENT_ID=a\nDXOS_ZALO_CLIENT_SECRET=b\n")
    started = []
    monkeypatch.setattr(zalo_main.Relay, "start", lambda self: started.append(self))
    assert zalo_main.start_relay(make_config(tmp_path)) is started[0]


def test_sigterm_exits_cleanly(monkeypatch, tmp_path):
    handlers = []
    monkeypatch.setenv("DXOS_ZALO_INTERVAL_SECONDS", "5")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setenv("DXOS_ZALO_ENV_DIR", str(tmp_path))
    monkeypatch.setattr(zalo_main.signal, "signal", lambda sig, h: handlers.append(h))
    done = threading.Event()
    t = threading.Thread(target=lambda: (zalo_main.main(), done.set()))
    t.start()
    while not handlers:
        pass
    handlers[0](15, None)
    assert done.wait(5), "main did not exit after SIGTERM"
    t.join()


def test_config_defaults_and_overrides(monkeypatch):
    for name in ("DXOS_ZALO_INTERVAL_SECONDS", "DXOS_HEARTBEAT_PATH", "ZALO_API_BASE", "ZALO_APP_ID"):
        monkeypatch.delenv(name, raising=False)
    cfg = Config.from_env()
    assert cfg.interval_seconds == 30.0 and cfg.heartbeat_path == "/tmp/dxos-zalo.heartbeat"
    assert cfg.api_base == "https://business.openapi.zalo.me" and cfg.app_id == ""
    monkeypatch.setenv("ZALO_API_BASE", "http://stub:8084/")
    assert Config.from_env().api_base == "http://stub:8084"
