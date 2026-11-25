# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static checks of the shell smoke scripts that need a running stack (run by CI on the real platform)."""
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "platform" / "tests"
SHELL_SCRIPTS = [
    "smoke-telegram.sh", "smoke-platform.sh", "smoke-agent.sh", "smoke-llm.sh", "smoke-agents.sh", "smoke-agentic.sh", "lib.sh", "lib-telegram.sh", "tokens.sh",
]


@pytest.mark.parametrize("name", SHELL_SCRIPTS)
def test_shell_scripts_parse(name):
    run = subprocess.run(["bash", "-n", str(TESTS / name)], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr


def test_platform_smoke_runs_the_telegram_smoke_after_the_agent_smoke():
    text = (TESTS / "smoke-platform.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-agent.sh") < text.index("source platform/tests/smoke-telegram.sh")


def test_telegram_smoke_uses_only_the_contract_routes_and_tables():
    text = (TESTS / "smoke-telegram.sh").read_text(encoding="utf-8") + (TESTS / "lib-telegram.sh").read_text(encoding="utf-8")
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


def test_m4_agents_smoke_runs_after_the_provider_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-llm.sh") < text.index("source platform/tests/smoke-agents.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the M4 checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh"):
        assert "smoke-agents.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_telegram_helpers_are_shared_by_the_telegram_and_m4_smokes():
    assert "source platform/tests/lib-telegram.sh" in (TESTS / "smoke-telegram.sh").read_text(encoding="utf-8")
    assert "source platform/tests/lib-telegram.sh" in (TESTS / "smoke-agents.sh").read_text(encoding="utf-8")


def test_m4_smoke_enables_no_agent_and_only_sets_the_bulletin_provider():
    # A2-A5 run for every cooperative that has credentials; the smoke must not switch their agent_settings rows.
    text = (TESTS / "smoke-agents.sh").read_text(encoding="utf-8")
    for agent in ("field-watch", "disease-watch", "harvest-ready", "bulletin"):
        assert f"'{agent}', true" not in text, agent
    assert "'bulletin'" in text and "'anthropic'" in text
