#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# External LLM provider path (ADR 0004): journal-review calls the test stub as Anthropic, the farmer's phone number and
# e-mail never reach it, the call is audited, and the next run still proposes when the stub is gone.
# Sourced by smoke-agentic.sh after the web-up agent and Telegram smokes; it does not run on its own. Fake key only.
echo "[llm]"

LLM_STUB="http://127.0.0.1:8082"
LLM_KEY="smoke-fake-anthropic-key"
LLM_T0=$(psql_app "select now()")

# Polls a one-value query until it returns the expected text: wait_psql <sql> <expected> [tries, 2 s apart]
wait_psql() {
  local got=""
  for _ in $(seq 1 "${3:-40}"); do
    got="$(psql_app "$1")"
    [ "$got" = "$2" ] && return 0
    sleep 2
  done
  return 1
}

llm_stub() {  # up | stop
  if [ "$1" = up ]; then
    $COMPOSE --profile llm-test up -d --no-deps llm-test-stub >/dev/null
    for _ in $(seq 1 30); do
      if curl -sf "$LLM_STUB/healthz" >/dev/null; then
        curl -sf -X POST "$LLM_STUB/control/reset" >/dev/null  # only this run's requests are checked
        return 0
      fi
      sleep 1
    done
    fail "llm-test-stub does not answer on $LLM_STUB"
  else
    $COMPOSE --profile llm-test stop llm-test-stub >/dev/null
  fi
}

llm_cleanup() {
  psql_app "delete from platform.agent_proposals where subject_ids && array['je_smoke_llm_tc','je_smoke_llm_tc_2'] or run_id in (select id from platform.agent_runs where htx_code='TC' and agent='journal-review' and started_at >= '$LLM_T0')" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent='journal-review' and started_at >= '$LLM_T0'" >/dev/null 2>&1 || true
  psql_app "delete from journal_entries where id in ('je_smoke_llm_tc','je_smoke_llm_tc_2')" >/dev/null 2>&1 || true
  psql_app "update platform.agent_settings set provider='ollama' where htx_code='TC' and agent='journal-review'" >/dev/null 2>&1 || true
  # Recreate the agent without the test overrides, then stop it as smoke-agent leaves it.
  $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null 2>&1 && $COMPOSE stop dxos-agent >/dev/null 2>&1 || true
  $COMPOSE --profile llm-test rm -sf llm-test-stub >/dev/null 2>&1 || true
  ./dxos agent disable TC >/dev/null 2>&1 || true
}
trap llm_cleanup EXIT

./dxos agent enable TC >/dev/null
# The farmer note carries a phone number and an e-mail address; the agent must redact both before the call.
psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at) values
  ('je_smoke_llm_tc', 'pc_tc_1', now(), 'SPRAYING', 'Smoke LLM', 'FARMER', 'PENDING_APPROVAL', 'Gọi 0912 345 678 hoặc gửi hoang.nong@example.com', now())
  on conflict (id) do update set notes = excluded.notes, updated_at = now()" >/dev/null

llm_stub up
# The agent gets the fake key and the stub as its Anthropic endpoint through this command only; the agent then reads
# its provider for journal-review from the web settings, which the manager's choice on the settings tab writes.
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null
psql_app "update platform.agent_settings set provider='anthropic' where htx_code='TC' and agent='journal-review'" >/dev/null

AT_TC=$(client_token TC)
[ -n "$AT_TC" ] || fail "agent token for TC is empty (llm smoke)"
assert_eq "$($COMPOSE exec -T web node -e '
fetch("http://apisix:9081/api/internal/agent/settings", { headers: { Authorization: "Bearer " + process.argv[1] } })
  .then((r) => r.json())
  .then((j) => console.log(j.data.agents["journal-review"].provider))
  .catch(() => console.log("error"));' "$AT_TC")" "anthropic" "settings route reports the anthropic provider for TC journal-review (C1)"

wait_psql "select coalesce(details->'providers' ? 'anthropic', false) from platform.service_heartbeats where service='agent:TC'" "t" 30 \
  && pass "agent heartbeat lists anthropic as an available provider (C3)" \
  || fail "agent heartbeat for TC does not list anthropic"

wait_psql "select count(*) >= 1 from platform.agent_runs where htx_code='TC' and agent='journal-review' and provider='anthropic' and status='ok' and started_at >= '$LLM_T0'" "t" 60 \
  && pass "dxos-agent runs journal-review for TC through anthropic" \
  || fail "no successful anthropic run for TC within 120 s"
assert_eq "$(psql_app "select tokens_in || ':' || tokens_out from platform.agent_runs where htx_code='TC' and agent='journal-review' and provider='anthropic' and tokens_in is not null and started_at >= '$LLM_T0' order by started_at desc limit 1")" "123:45" "the anthropic run stores the provider's token counts (C2)"

# What left the server: the stub's Anthropic request shape, the fake key, and the redacted note only.
assert_eq "$(curl -sf "$LLM_STUB/control/calls" | PYTHONIOENCODING=utf-8 python3 -c '
import json, sys
calls = json.load(sys.stdin)["calls"]
text = json.dumps(calls, ensure_ascii=False)
ok = bool(calls) and all(
    c["path"] == "/v1/messages" and c["x-api-key"] == sys.argv[1] and c["anthropic-version"] == "2023-06-01"
    and c["body"].get("model") == "claude-haiku-5-5" for c in calls
) and "0912" not in text and "345 678" not in text and "example.com" not in text and "[đã ẩn]" in text
print("ok" if ok else "bad")' "$LLM_KEY")" "ok" "anthropic request has the expected shape and no phone number or e-mail (C4, C5, spec test 9)"

# The web writes one audit event per run that called a provider (C2); its op carries the event name.
wait_psql "select exists(select 1 from audit.events where op='agent.external_call' and occurred_at >= '$LLM_T0')" "t" 20 \
  && pass "audit chain records agent.external_call (C2)" \
  || fail "no agent.external_call audit event after the anthropic run"

# Provider gone: the next run must still propose (fallback, spec test 8). The second entry appears only after the stop.
llm_stub stop
T_STOP=$(psql_app "select now()")
psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at) values
  ('je_smoke_llm_tc_2', 'pc_tc_1', now(), 'SPRAYING', 'Smoke LLM 2', 'FARMER', 'PENDING_APPROVAL', 'smoke fallback', now())
  on conflict (id) do update set updated_at = now()" >/dev/null
wait_psql "select exists(select 1 from platform.agent_proposals where 'je_smoke_llm_tc_2' = any(subject_ids))" "t" 45 \
  && pass "with the provider unreachable the next run still files a proposal (fallback)" \
  || fail "no proposal for je_smoke_llm_tc_2 while the provider was unreachable"
assert_eq "$(psql_app "select count(*) from platform.agent_runs where htx_code='TC' and agent='journal-review' and started_at >= '$T_STOP' and status='failed'")" "0" "no run failed when the provider went away"
