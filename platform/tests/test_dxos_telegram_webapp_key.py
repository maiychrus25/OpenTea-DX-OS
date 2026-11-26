# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""./dxos telegram enable writes the derived Mini App key (C1) to the web's roles.env and never the bot token."""
import hashlib
import hmac
import subprocess
from pathlib import Path

DXOS = Path(__file__).resolve().parents[2] / "dxos"
FAKE_TOKEN = "123456:fake-bot-token-for-tests"
EXPECTED_KEY = hmac.new(b"WebAppData", FAKE_TOKEN.encode(), hashlib.sha256).hexdigest()


def function_body(name):
    return subprocess.run(["sed", "-n", f"/^{name}()/,/^}}/p", str(DXOS)], capture_output=True, text=True).stdout


def run_enable(tmp_path, token_env):
    """Run the real telegram_enable with stub helpers; every file written by the helper lands in tmp_path/<dir>/<file>."""
    snippet = (
        "set -euo pipefail\n"
        f"kc_exec() {{ printf 'tg-secret\\nroles-secret\\n'; }}\n"
        f"telegram_env_write() {{ mkdir -p {tmp_path}/$1; cat > {tmp_path}/$1/$2; }}\n"
        "telegram_restart() { :; }\n"
        f"{function_body('telegram_webapp_key')}\n{function_body('telegram_enable')}\n"
        "telegram_enable\n"
    )
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", **token_env}
    return subprocess.run(["bash", "-c", snippet], capture_output=True, text=True, env=env, cwd=tmp_path)


def test_web_receives_the_derived_key_and_never_the_bot_token(tmp_path):
    run = run_enable(tmp_path, {"TELEGRAM_BOT_TOKEN": FAKE_TOKEN})
    assert run.returncode == 0, run.stderr
    roles = (tmp_path / "run/dxos-web/roles.env").read_text()
    assert f"DXOS_TELEGRAM_WEBAPP_KEY={EXPECTED_KEY}\n" in roles
    assert "DXOS_ROLES_CLIENT_SECRET=roles-secret" in roles
    assert FAKE_TOKEN not in roles and "TELEGRAM_BOT_TOKEN" not in roles
    assert FAKE_TOKEN not in run.stdout + run.stderr and EXPECTED_KEY not in run.stdout + run.stderr


def test_the_relay_file_has_no_derived_key(tmp_path):
    run_enable(tmp_path, {"TELEGRAM_BOT_TOKEN": FAKE_TOKEN})
    relay = (tmp_path / "run/dxos-telegram/telegram.env").read_text()
    assert "WEBAPP_KEY" not in relay and FAKE_TOKEN not in relay


def test_without_a_token_no_key_is_written_and_enable_still_works(tmp_path):
    run = run_enable(tmp_path, {})
    assert run.returncode == 0, run.stderr
    assert "WEBAPP_KEY" not in (tmp_path / "run/dxos-web/roles.env").read_text()
