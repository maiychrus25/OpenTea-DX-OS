#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Autonomous mode (M12) for TC. The mode is turned on directly in SQL, a smoke shortcut: the enable route needs a fresh
# browser login (auth_time), which a bash smoke cannot hold. Then, through the internal proposals route: a low notice runs
# on the next tick with channel autopilot; a medium tightening settings change gets a run_at about 15 minutes ahead and the
# Chặn button the stub recorded blocks it; /dung from the linked manager stops the mode and clears every pending run_at;
# a loosening settings change never gets a run_at (test 31). Sourced by smoke-agentic.sh after smoke-mcp.sh, which left
# the owner linked, the relay up and the agent running; it does not run on its own. It adds no PASS line to make
# platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-autopilot.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

# The relay and the web are the same preconditions as the MCP smoke, which skips without the web.
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: autopilot smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi

echo "[autopilot]"
M12_T0=$(psql_app "select now()")
M12_NONE="00000000-0000-0000-0000-000000000000"
# One subject per proposal: the 24-hour dedupe of the route judges duplicates by kind and subjects.
M12_SUBJECTS="array['m12-notice-tc','harvest-ready.harvest_window_days','field-watch.silent_hours','field-watch.heavy_rain_mm']"
M12_ROWS="select id from platform.agent_proposals where htx_code='TC' and subject_ids && $M12_SUBJECTS"

# Restores what this smoke changed: the mode (the row is removed, so TC is back to off), its proposals and their messages,
# and the notices of the run. The EXIT trap of smoke-mcp is replaced, so this one chains it after its own cleanup.
autopilot_cleanup() {
  psql_app "delete from platform.autopilot where htx_code='TC'" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_outbox where proposal_id in ($M12_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($M12_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($M12_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from notifications where created_at >= '$M12_T0'" >/dev/null 2>&1 || true
}
trap 'autopilot_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# Posts one proposal through the internal route as the TC agent and prints its id. A dedupe answer has no id and fails.
m12_post() {  # <agent> <kind> <payload json>
  local body
  body="$(jq -nc --arg agent "$1" --arg kind "$2" --argjson payload "$3" \
    '{agent: $agent, kind: $kind, payload: $payload, reason_vi: "Kiểm thử tự vận hành M12", evidence: {rows: [], sha256: "m12-smoke"}}')"
  $COMPOSE exec -T web node -e '
const [token, body] = process.argv.slice(1);
fetch("http://apisix:9081/api/internal/agent/proposals", {
  method: "POST",
  headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  body,
}).then(async (res) => {
  const json = await res.json().catch(() => ({}));
  if (res.status !== 201 || !json?.data?.id) { console.error(res.status, JSON.stringify(json)); process.exit(1); }
  console.log(json.data.id);
}).catch((err) => { console.error(err); process.exit(1); });' "$M12_AT" "$body"
}

# The Chặn button sent to the owner for one proposal, taken from the stub's recorded keyboard: callback_data carries the
# proposal id in base64url (see callback-data.ts) and the op `b`, and is never built here.
m12_block_data_for() {  # <proposal uuid>
  local id64
  id64="$(python3 -c 'import base64, sys; print(base64.urlsafe_b64encode(bytes.fromhex(sys.argv[1].replace("-", ""))).decode().rstrip("="))' "$1")"
  stub_calls | python3 -c '
import json, sys
prefix = "v1|" + sys.argv[1] + "|b|"
for call in json.load(sys.stdin):
    if call["method"] != "sendMessage" or call["params"].get("chat_id") != '"$TG_OWNER"':
        continue
    for row in call["params"].get("reply_markup", {}).get("inline_keyboard", []):
        for button in row:
            if button.get("text") == "Chặn" and button.get("callback_data", "").startswith(prefix):
                print(button["callback_data"])
                sys.exit(0)
sys.exit(1)' "$id64"
}

M12_AT=$(client_token TC)
[ -n "$M12_AT" ] || fail "agent token for TC is empty (autopilot smoke)"
M12_SUB="$(python3 -c 'import base64, json, sys; p = sys.argv[1].split(".")[1]; p += "=" * (-len(p) % 4); print(json.loads(base64.urlsafe_b64decode(p))["sub"])' "$(user_token smoke_manager_tc)")"

# Clean slate: no leftover of a crashed run, and no open TC proposal that the mode could pick up while it is on.
autopilot_cleanup
psql_app "update platform.agent_proposals set status = 'expired' where htx_code = 'TC' and status = 'proposed'" >/dev/null

# The mode on for TC, enabled by smoke_manager_tc (an officer or manager of TC is who the real enable screen records).
psql_app "insert into platform.autopilot (htx_code, enabled, enabled_by, enabled_by_name, enabled_at, unlocked_kinds, daily_cap, last_manager_activity_at)
  values ('TC', true, '$M12_SUB', 'Smoke Manager TC', now(), '{}', 50, now())" >/dev/null
assert_eq "$(psql_app "select enabled::text from platform.autopilot where htx_code='TC'")" "true" "autonomous mode is on for TC (seeded in SQL)"

# 1. A low notice runs on the next tick (window 0) as the agent's tick reaches the web, with channel autopilot.
M12_NOTICE=$(m12_post field-watch notification.internal "$(jq -nc \
  '{template: "sensor_silent", slots: {parcel_code: "P-TC-002", sensor: "soil_moisture", hours: 8}, subjects: ["m12-notice-tc"]}')") \
  || fail "the internal notice was not accepted by the internal proposals route (autopilot smoke)"
assert_eq "$(psql_app "select shadow_auto::text from platform.agent_proposals where id='$M12_NOTICE'")" "true" \
  "the low notice is recorded as one the mode would run (shadow_auto)"
wait_psql "select status || ':' || coalesce(decision_channel, '') from platform.agent_proposals where id='$M12_NOTICE'" "executed:autopilot" 60 \
  || fail "the low notice was not executed with channel autopilot within 120 s (does dxos-agent post the tick?)"
pass "a low notice runs on the next tick, executed with channel autopilot"

# 2. A medium tightening settings change waits about 15 minutes, and the owner gets Chặn from the stub's keyboard.
n=$(tg_count "$TG_OWNER" "Sẽ tự chạy lúc")
M12_MEDIUM=$(m12_post improvement agent.settings.update '{"agent": "harvest-ready", "thresholds": {"harvest_window_days": 5}}') \
  || fail "the tightening settings change was not accepted by the internal proposals route (autopilot smoke)"
assert_eq "$(psql_app "select (run_at between now() + interval '14 minutes' and now() + interval '16 minutes')::text || ':' || status from platform.agent_proposals where id='$M12_MEDIUM'")" \
  "true:proposed" "a medium proposal gets a run_at about 15 minutes ahead and stays proposed"
tg_expect "$TG_OWNER" "Sẽ tự chạy lúc" "$n" || fail "no 'Sẽ tự chạy lúc' message to the linked manager within 90 s"
M12_BLOCK_DATA=""
for _ in $(seq 1 30); do
  M12_BLOCK_DATA="$(m12_block_data_for "$M12_MEDIUM" 2>/dev/null)" && [ -n "$M12_BLOCK_DATA" ] && break
  M12_BLOCK_DATA=""
  sleep 2
done
[ -n "$M12_BLOCK_DATA" ] || fail "the message for the medium proposal carries no Chặn button"
tg_callback "$TG_OWNER" "$TG_OWNER" private "$M12_BLOCK_DATA" "cq-m12-block"
wait_psql "select (blocked_by is not null)::text || ':' || (run_at is null)::text || ':' || status from platform.agent_proposals where id='$M12_MEDIUM'" \
  "true:true:proposed" 30 || fail "the Chặn button did not block the proposal (blocked_by set, run_at cleared, still proposed)"
pass "Chặn blocks the proposal and returns it to normal approval"

# 3. A loosening change never gets a run_at (test 31); a second tightening one waits, to be returned by /dung.
M12_LOOSE=$(m12_post improvement agent.settings.update '{"agent": "field-watch", "thresholds": {"heavy_rain_mm": 20}}') \
  || fail "the loosening settings change was not accepted by the internal proposals route (autopilot smoke)"
assert_eq "$(psql_app "select (run_at is null)::text || ':' || coalesce(shadow_auto::text, 'null') from platform.agent_proposals where id='$M12_LOOSE'")" \
  "true:false" "test 31: a loosening settings change gets no run_at and is not shadow-eligible"
M12_PENDING=$(m12_post improvement agent.settings.update '{"agent": "field-watch", "thresholds": {"silent_hours": 2}}') \
  || fail "the second tightening settings change was not accepted by the internal proposals route (autopilot smoke)"
assert_eq "$(psql_app "select (run_at is not null)::text from platform.agent_proposals where id='$M12_PENDING'")" "true" \
  "a second tightening change waits with a run_at"

# 4. /dung from the linked manager stops the mode and returns every pending window to normal approval (test 21).
M12_STOP_TEXT="Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt."
n=$(tg_count "$TG_OWNER" "$M12_STOP_TEXT")
tg_text "$TG_OWNER" "/dung"
tg_expect "$TG_OWNER" "$M12_STOP_TEXT" "$n" || fail "no '$M12_STOP_TEXT' reply to /dung within 90 s"
pass "/dung replies with the stop text"
assert_eq "$(psql_app "select enabled::text || ':' || coalesce(stop_reason, '') from platform.autopilot where htx_code='TC'")" "false:manual" \
  "/dung stops the mode with reason manual"
assert_eq "$(psql_app "select count(*) from platform.agent_proposals where htx_code='TC' and (run_at is not null or run_claimed_at is not null)")" "0" \
  "every pending run_at of TC is cleared by the stop"
assert_eq "$(psql_app "select status from platform.agent_proposals where id='$M12_PENDING'")" "proposed" "the pending proposal is back to normal approval"
