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
    "smoke-campaign.sh", "smoke-improvement.sh", "smoke-mcp.sh", "smoke-autopilot.sh", "smoke-app-actions.sh", "smoke-builder.sh", "smoke-agentic.sh", "lib.sh", "lib-telegram.sh", "tokens.sh",
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


def test_improvement_smoke_runs_after_the_campaign_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-campaign.sh") < text.index("source platform/tests/smoke-improvement.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the improvement checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh", "smoke-assistant.sh", "smoke-campaign.sh"):
        assert "smoke-improvement.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_improvement_smoke_stops_the_agent_before_seeding_and_restarts_it_after():
    text = (TESTS / "smoke-improvement.sh").read_text(encoding="utf-8")
    # A running agent between the seeds and its restart would race with them (lesson 5 of M4).
    assert text.index("$COMPOSE stop dxos-agent") < text.index("insert into platform.agent_proposals") < text.index("--force-recreate dxos-agent")


def test_improvement_smoke_restores_its_rows_and_thresholds_on_exit_before_the_campaign_cleanup():
    text = (TESTS / "smoke-improvement.sh").read_text(encoding="utf-8")
    # The EXIT trap of smoke-campaign is replaced, so this one chains it after the improvement cleanup.
    assert "trap 'improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text
    for statement in ("delete from platform.improvements", "delete from platform.agent_proposals",
                      "delete from platform.agent_runs", "M8_THRESHOLDS"):
        assert statement in text, statement


def test_improvement_smoke_approves_from_the_recorded_keyboard_and_signs_nothing():
    text = (TESTS / "smoke-improvement.sh").read_text(encoding="utf-8")
    assert "approve_by_telegram" in text
    assert "callback_sign" not in text and "hmac" not in text


def test_improvement_smoke_checks_that_only_the_silent_hours_threshold_changes():
    text = (TESTS / "smoke-improvement.sh").read_text(encoding="utf-8")
    assert "reject_rate:field-watch:sensor_silent" in text
    assert "jsonb_build_object('silent_hours', 8)" in text


def test_mcp_smoke_runs_after_the_improvement_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-improvement.sh") < text.index("source platform/tests/smoke-mcp.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the MCP checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh", "smoke-improvement.sh"):
        assert "smoke-mcp.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_mcp_smoke_chains_every_earlier_cleanup_on_exit():
    # The EXIT trap of smoke-improvement is replaced, so this one chains it after its own cleanup.
    text = (TESTS / "smoke-mcp.sh").read_text(encoding="utf-8")
    assert "trap 'mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text


def test_mcp_smoke_restores_the_client_grant_and_removes_the_token_file():
    text = (TESTS / "smoke-mcp.sh").read_text(encoding="utf-8")
    assert "M14_DIRECT_BEFORE" in text and "mcp_restore_client" in text
    assert "rm -rf \"$M14_HOME\"" in text and "chmod 700" in text and "0o600" in text


def test_mcp_smoke_never_prints_a_token_or_turns_on_shell_tracing():
    text = (TESTS / "smoke-mcp.sh").read_text(encoding="utf-8")
    assert "set -x" not in text
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        if any(word in line for word in ("echo", "printf", "cat ")):
            assert "TOKEN" not in line.upper(), line


def test_mcp_smoke_uses_the_bridge_routes_and_the_recorded_keyboard_and_signs_nothing():
    text = (TESTS / "smoke-mcp.sh").read_text(encoding="utf-8")
    for needle in ("make mcp-client", "/api/mcp/tools", "platform/mcp/dxos_mcp.py serve", "tools/list", "tools/call",
                   "approve_by_telegram mcp", "notification.internal"):
        assert needle in text, needle
    assert "callback_sign" not in text and "hmac" not in text


def test_mcp_smoke_checks_the_lot_verification_line_and_no_name():
    text = (TESTS / "smoke-mcp.sh").read_text(encoding="utf-8")
    assert "kiểm chứng trong sổ audit" in text and "trưởng HTX" in text
    assert "/lot/" in text and "Smoke Manager" in text


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


def test_autopilot_smoke_runs_last_in_the_agentic_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-mcp.sh") < text.index("source platform/tests/smoke-autopilot.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the autopilot checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh", "smoke-mcp.sh"):
        assert "smoke-autopilot.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_autopilot_smoke_chains_every_earlier_cleanup_on_exit():
    # The EXIT trap of smoke-mcp is replaced, so this one chains it after its own cleanup.
    text = (TESTS / "smoke-autopilot.sh").read_text(encoding="utf-8")
    assert "trap 'autopilot_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text


def test_autopilot_smoke_restores_the_mode_and_its_rows_on_exit():
    text = (TESTS / "smoke-autopilot.sh").read_text(encoding="utf-8")
    for needle in ("delete from platform.autopilot where htx_code='TC'", "delete from platform.agent_proposals",
                   "delete from platform.telegram_outbox", "delete from platform.telegram_conversations"):
        assert needle in text, needle


def test_autopilot_smoke_presses_the_button_the_stub_recorded_and_signs_nothing():
    text = (TESTS / "smoke-autopilot.sh").read_text(encoding="utf-8")
    for needle in ("m12_block_data_for", "stub_calls", "/api/internal/agent/proposals", "/dung",
                   "executed:autopilot", "test 31", "Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt."):
        assert needle in text, needle
    assert "callback_sign" not in text and "hmac" not in text


def test_app_actions_smoke_runs_after_the_autopilot_smoke_and_stays_out_of_the_platform_count():
    text = (TESTS / "smoke-agentic.sh").read_text(encoding="utf-8")
    assert text.index("source platform/tests/smoke-autopilot.sh") < text.index("source platform/tests/smoke-app-actions.sh")
    # smoke-apps.sh counts the PASS lines of make platform-smoke, so the app action checks must not run there.
    for name in ("smoke-platform.sh", "smoke-agent.sh", "smoke-telegram.sh", "smoke-autopilot.sh"):
        assert "smoke-app-actions.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_app_actions_smoke_chains_every_earlier_cleanup_and_reinstalls_the_app():
    text = (TESTS / "smoke-app-actions.sh").read_text(encoding="utf-8")
    assert "trap 'app_actions_cleanup; autopilot_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT" in text
    for needle in ("delete from platform.agent_proposals", "delete from platform.telegram_outbox",
                   "delete from platform.telegram_conversations", "./dxos install miniapps/tea-shop"):
        assert needle in text, needle


def test_app_actions_smoke_stops_the_agent_before_seeding_and_restarts_it_after():
    text = (TESTS / "smoke-app-actions.sh").read_text(encoding="utf-8")
    # A running agent between the seeds and its restart would race with them (lesson 5 of M4).
    assert text.index("$COMPOSE stop dxos-agent") < text.index("insert into app_tea_shop.products") < text.index("--force-recreate dxos-agent")


def test_app_actions_smoke_approves_from_the_recorded_keyboard_and_signs_nothing():
    text = (TESTS / "smoke-app-actions.sh").read_text(encoding="utf-8")
    for needle in ("approve_by_telegram", "./dxos apps actor enable", "./dxos remove tea-shop", "executed:telegram",
                   "test 16", "app.tea-shop.promotion.create"):
        assert needle in text, needle
    assert "callback_sign" not in text and "hmac" not in text


def builder_smoke():
    return (TESTS / "smoke-builder.sh").read_text(encoding="utf-8")


def test_builder_smoke_is_a_job_of_its_own_and_stays_out_of_the_other_smokes():
    # The image is large, so CI runs it in a separate job (plan M13); it must not sit in the agentic or platform counts.
    for name in ("smoke-agentic.sh", "smoke-platform.sh", "smoke-agent.sh"):
        assert "smoke-builder.sh" not in (TESTS / name).read_text(encoding="utf-8"), name


def test_builder_smoke_uses_the_replay_tool_and_the_replay_agent_and_never_a_real_key():
    text = builder_smoke()
    assert "replay:fertiliser-stock" in text and "DXOS_AGENT_PROVIDER: replay" in text
    assert "ANTHROPIC_API_KEY" not in text and "OPENAI_API_KEY" not in text


def test_builder_smoke_covers_tests_26_to_30():
    text = builder_smoke()
    for needle in ("test 26", "test 27", "test 28", "test 29", "test 30", "with-script", "extra-dependency", "with-agent-actions",
                   "env-probe.json", "sendMediaGroup", "apisix:9081", "example.com"):
        assert needle in text, needle


def test_builder_smoke_stops_the_agent_before_seeding_and_removes_what_it_made_on_exit():
    text = builder_smoke()
    assert text.index("stop dxos-agent") < text.index("delete from platform.app_catalog where owner_htx is null")
    assert "trap builder_cleanup EXIT" in text
    for needle in ('./dxos remove "$APP_ID" --purge', 'rm -rf "generated-apps/TC"', "delete from platform.app_build_requests"):
        assert needle in text, needle


def test_builder_smoke_signs_nothing_and_presses_the_button_the_stub_recorded():
    text = builder_smoke()
    assert "telegram_approve_data_for" in text and "hmac" not in text.lower()
