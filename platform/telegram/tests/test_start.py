# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The relay starts only with a bot token and a readable credentials file; otherwise the service idles."""
from dxos_telegram import __main__ as telegram_main
from dxos_telegram.config import Config


def make_config(tmp_path, token):
    return Config(interval_seconds=30, heartbeat_path=str(tmp_path / "hb"), bot_token=token, env_dir=tmp_path)


def test_no_token_means_idle(tmp_path):
    (tmp_path / "telegram.env").write_text("DXOS_TELEGRAM_CLIENT_ID=a\nDXOS_TELEGRAM_CLIENT_SECRET=b\n")
    assert telegram_main.start_relay(make_config(tmp_path, "")) is None


def test_missing_credentials_means_idle(tmp_path):
    assert telegram_main.start_relay(make_config(tmp_path, "123:abc")) is None


def test_incomplete_credentials_means_idle(tmp_path):
    (tmp_path / "telegram.env").write_text("DXOS_TELEGRAM_CLIENT_ID=a\n")
    assert telegram_main.start_relay(make_config(tmp_path, "123:abc")) is None
