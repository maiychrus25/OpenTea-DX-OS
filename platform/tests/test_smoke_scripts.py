# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static checks of the shell smoke scripts that need a running stack (run by CI on the real platform)."""
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "platform" / "tests"
SHELL_SCRIPTS = [
    "smoke-telegram.sh", "smoke-platform.sh", "smoke-agent.sh", "smoke-llm.sh", "smoke-agentic.sh", "lib.sh", "tokens.sh",
]


@pytest.mark.parametrize("name", SHELL_SCRIPTS)
def test_shell_scripts_parse(name):
    run = subprocess.run(["bash", "-n", str(TESTS / name)], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr


def test_platform_smoke_runs_the_telegram_smoke_after_the_agent_smoke():
    text = (TESTS / "smoke-platform.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-agent.sh") < text.index("source platform/tests/smoke-telegram.sh")


def test_telegram_smoke_uses_only_the_contract_routes_and_tables():
    text = (TESTS / "smoke-telegram.sh").read_text(encoding="utf-8")
    for needle in ("/api/internal/telegram/", "platform.telegram_link_codes", "platform.telegram_links",
                   "platform.agent_proposals", "./dxos telegram enable", "./dxos telegram disable"):
        assert needle in text, needle
    assert "code_hash" in text and "sha256" in text  # the code is stored as its hash only


def test_agentic_smoke_runs_the_provider_smoke_last():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-agent.sh") < text.index("source platform/tests/smoke-telegram.sh")
    assert text.index("source platform/tests/smoke-telegram.sh") < text.index("source platform/tests/smoke-llm.sh")


def test_provider_smoke_stays_out_of_the_platform_smoke_count():
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the provider checks must not run there.
    assert "smoke-llm.sh" not in (TESTS / "smoke-platform.sh").read_text(encoding="utf-8")
    assert "smoke-llm.sh" not in (TESTS / "smoke-agent.sh").read_text(encoding="utf-8")
