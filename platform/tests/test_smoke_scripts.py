# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static checks of the shell smoke scripts that need a running stack (run by CI on the real platform)."""
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "platform" / "tests"
SHELL_SCRIPTS = [
    "smoke-telegram.sh", "smoke-platform.sh", "smoke-agent.sh", "smoke-llm.sh", "smoke-agents.sh", "smoke-assistant.sh",
    "smoke-campaign.sh", "smoke-agentic.sh", "lib.sh", "lib-telegram.sh", "tokens.sh",
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


def test_m4_smoke_stops_the_agent_before_the_clean_slate_and_restarts_it_after_the_link():
    # A cycle of the running agent between the clean slate and the Telegram link files the warnings with no message
    # to the manager, and the restarted agent then dedupes them (main CI 2026-11-25).
    text = (TESTS / "smoke-agents.sh").read_text(encoding="utf-8")
    assert text.index("$COMPOSE stop dxos-agent") < text.index("M4_OLD=") < text.index("telegram_link_owner") < text.index("--force-recreate dxos-agent")


def test_assistant_smoke_runs_after_the_m4_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-agents.sh") < text.index("source platform/tests/smoke-assistant.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the assistant checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh"):
        assert "smoke-assistant.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_assistant_smoke_stops_the_agent_before_seeding_and_restores_on_exit():
    text = (TESTS / "smoke-assistant.sh").read_text(encoding="utf-8")
    # A running agent between the seeds and its restart would race with them (lesson 5 of M4).
    assert text.index("$COMPOSE stop dxos-agent") < text.index("insert into journal_entries") < text.index("--force-recreate dxos-agent")
    # The EXIT trap of smoke-agents is replaced, so this one must chain it: the assistant cleanup, then the M4 and LLM ones.
    assert "trap 'assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text
    assert "update platform.agent_settings set provider='$AS_ASSISTANT_PROVIDER'" in text
    assert "delete from platform.agent_settings where htx_code='TC' and agent='assistant'" in text


def test_assistant_smoke_uses_the_callback_data_the_stub_recorded():
    # Button data comes from the stub's recorded reply_markup; the smoke never signs a callback itself.
    text = (TESTS / "smoke-assistant.sh").read_text(encoding="utf-8")
    assert "reply_markup" in text and "callback_sign" not in text and "hmac" not in text


def test_campaign_smoke_runs_after_the_assistant_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-assistant.sh") < text.index("source platform/tests/smoke-campaign.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the campaign checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh", "smoke-assistant.sh"):
        assert "smoke-campaign.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_campaign_smoke_stops_the_agent_before_seeding_and_restarts_it_after():
    # A running agent between the seeds and its restart would race with them (lesson 5 of M4).
    text = (TESTS / "smoke-campaign.sh").read_text(encoding="utf-8")
    assert text.index("$COMPOSE stop dxos-agent") < text.index("insert into parcels") < text.index("--force-recreate dxos-agent")


def test_campaign_smoke_restores_its_rows_on_exit_before_the_assistant_cleanup():
    text = (TESTS / "smoke-campaign.sh").read_text(encoding="utf-8")
    # The EXIT trap of smoke-assistant is replaced, so this one chains it after the campaign cleanup.
    assert "trap 'campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text
    for statement in ("delete from platform.campaigns", "delete from platform.agent_proposals",
                      "delete from parcels where id='$M7_PARCEL'"):
        assert statement in text, statement


def test_campaign_smoke_presses_the_button_the_stub_recorded_and_signs_nothing():
    text = (TESTS / "smoke-campaign.sh").read_text(encoding="utf-8")
    assert "tg_button" in text and "Duyệt cả chiến dịch" in text
    assert "callback_sign" not in text and "hmac" not in text


def test_campaign_smoke_closes_older_open_proposals_before_seeding():
    # The earlier smokes leave many open TC proposals; with the 15-item cap the fresh notice fell out (M7 CI).
    text = (TESTS / "smoke-campaign.sh").read_text(encoding="utf-8")
    close = text.index("set status = 'expired' where htx_code = 'TC' and status = 'proposed'")
    assert text.index("$COMPOSE stop dxos-agent") < close < text.index("M7_NOTICE=$(m7_post")


def test_campaign_smoke_reads_the_approve_all_line_by_its_text():
    # Other messages to the manager (proposal syncs) arrive after the campaign edit, so the newest one is not it (M7 CI).
    text = (TESTS / "smoke-campaign.sh").read_text(encoding="utf-8")
    assert 'tg_last_with "$TG_OWNER" "Đã duyệt chiến dịch"' in text
    assert 'tg_last_text "$TG_OWNER"' not in text
