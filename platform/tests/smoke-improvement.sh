#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Weekly improvements (M8, agent A10) for TC: six rejected and one approved sensor_silent notice in the last 28 days make
# A10 propose a looser silent_hours; the manager approves it from the stub's recorded keyboard, the threshold changes and
# the improvement is adopted. Sourced by smoke-agentic.sh after smoke-campaign.sh, which left the owner linked and the
# agent running with the stub; it does not run on its own. It adds no PASS line to make platform-smoke, so smoke-apps.sh
# keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-improvement.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

echo "[improvement]"
M8_T0=$(psql_app "select now()")
M8_RUN=$(python3 -c 'import uuid; print(uuid.uuid4())')
M8_METRIC="reject_rate:field-watch:sensor_silent"
M8_WEEK_SQL="(date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh'))::date"  # the Monday of this week (Vietnam)
M8_WEEK_START_SQL="(date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')"
M8_SEEDED="exists (select 1 from unnest(subject_ids) as s where s like 'm8-silent-%')"  # the seeds of this run and of a crashed one
# The field-watch thresholds of TC as they were; an empty value means the row did not exist and is removed at cleanup.
M8_THRESHOLDS=$(psql_app "select coalesce((select thresholds::text from platform.agent_settings where htx_code='TC' and agent='field-watch'), '')")

# Restores what this smoke changed: the improvements and their proposals and messages, the improvement runs of the smoke,
# and the TC field-watch thresholds. The EXIT trap of smoke-campaign is replaced, so this one chains it after its own cleanup.
improvement_cleanup() {
  local rows="select id from platform.agent_proposals where $M8_SEEDED or id in (select proposal_id from platform.improvements where htx_code='TC' and created_at >= '$M8_T0' and proposal_id is not null)"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($rows)" >/dev/null 2>&1 || true
  # One statement removes the improvements and their proposals: the proposals are found from the improvements being deleted.
  psql_app "with gone as (delete from platform.improvements where htx_code='TC' and (created_at >= '$M8_T0' or metric_key='$M8_METRIC') returning proposal_id)
    delete from platform.agent_proposals where $M8_SEEDED or id in (select proposal_id from gone where proposal_id is not null)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent='improvement' and started_at >= '$M8_T0'" >/dev/null 2>&1 || true
  if [ -n "$M8_THRESHOLDS" ]; then
    psql_app "update platform.agent_settings set thresholds='$M8_THRESHOLDS'::jsonb where htx_code='TC' and agent='field-watch'" >/dev/null 2>&1 || true
  else
    psql_app "delete from platform.agent_settings where htx_code='TC' and agent='field-watch'" >/dev/null 2>&1 || true
  fi
}
trap 'improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# The agent stays stopped while the history is seeded (lesson 5 of M4); it restarts after the seeds.
$COMPOSE stop dxos-agent >/dev/null

# Clean slate for this week: an improvement of this week or of the metric blocks a new one (one per metric and week, and no
# repeat for 28 days), and a finished improvement run of this week means A10 does not run again on the restart.
M8_OLD="select id from platform.agent_proposals where $M8_SEEDED or id in (select proposal_id from platform.improvements where htx_code='TC' and (week = $M8_WEEK_SQL or metric_key='$M8_METRIC') and proposal_id is not null)"
psql_app "delete from platform.telegram_outbox where proposal_id in ($M8_OLD)" >/dev/null
psql_app "delete from platform.telegram_conversations where proposal_id in ($M8_OLD)" >/dev/null
psql_app "with gone as (delete from platform.improvements where htx_code='TC' and (week = $M8_WEEK_SQL or metric_key='$M8_METRIC') returning proposal_id)
  delete from platform.agent_proposals where $M8_SEEDED or id in (select proposal_id from gone where proposal_id is not null)" >/dev/null
psql_app "delete from platform.agent_runs where htx_code='TC' and agent='improvement' and started_at >= $M8_WEEK_START_SQL" >/dev/null

# Six rejected and one approved sensor_silent notices, decided two days ago (historical rows, as A2 files them).
psql_app "insert into platform.agent_proposals (htx_code, agent, kind, payload, reason_vi, evidence, risk, status, dedupe_key, subject_ids, created_at, expires_at, decided_by, decided_at, decision_channel)
  select 'TC', 'field-watch', 'notification.internal',
    jsonb_build_object('template', 'sensor_silent', 'subjects', jsonb_build_array('m8-silent-$M8_RUN-' || n::text)),
    'Kiểm thử cải tiến M8', '{}'::jsonb, 'low', case when n = 7 then 'executed' else 'rejected' end,
    'm8-silent-$M8_RUN-' || n::text, array['m8-silent-$M8_RUN-' || n::text],
    now() - interval '2 days', now() - interval '1 day', 'smoke-manager', now() - interval '2 days' + interval '3 hours', 'telegram'
  from generate_series(1, 7) as n" >/dev/null
# silent_hours back to the default (6), so the loosening step lands on 8.
psql_app "insert into platform.agent_settings (htx_code, agent, thresholds) values ('TC', 'field-watch', '{}')
  on conflict (htx_code, agent) do update set thresholds = '{}'" >/dev/null

# The agent starts again with the stub as its provider; its first cycle files this week's improvements (C4, on start).
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

wait_psql "select count(*) from platform.improvements where htx_code='TC' and week = $M8_WEEK_SQL and metric_key='$M8_METRIC'" "1" 90 \
  || fail "no sensor_silent improvement for TC within 180 s"
M8_PROPOSAL=$(psql_app "select proposal_id from platform.improvements where htx_code='TC' and week = $M8_WEEK_SQL and metric_key='$M8_METRIC'")
pass "A10 files one sensor_silent improvement for TC"
assert_eq "$(psql_app "select kind || ':' || status || ':' || (payload->>'agent') || ':' || (payload->'thresholds'->>'silent_hours') from platform.agent_proposals where id='$M8_PROPOSAL'")" \
  "agent.settings.update:proposed:field-watch:8" "the improvement's proposal is an open agent.settings.update with silent_hours 8"

# The manager approves it from Telegram; the button is the one the stub recorded for this proposal.
approve_by_telegram "m8-silent" "$M8_PROPOSAL"
assert_eq "$(psql_app "select thresholds = jsonb_build_object('silent_hours', 8) from platform.agent_settings where htx_code='TC' and agent='field-watch'")" "t" \
  "the TC field-watch thresholds change only silent_hours, to 8"
assert_eq "$(psql_app "select status from platform.improvements where proposal_id='$M8_PROPOSAL'")" "adopted" "the improvement is adopted after the approval"
