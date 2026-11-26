#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Daily campaign (M7, agent A9) for TC: one open notice and one open high-risk harvest are posted through the internal
# route, A9 files today's campaign on the agent's first cycle, and the approve-all button pressed from the stub's
# recorded keyboard runs the notice and leaves the harvest waiting (test 14). Sourced by smoke-agentic.sh after
# smoke-assistant.sh, which left the owner linked and the agent running with the stub; it does not run on its own. It
# adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-campaign.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

echo "[campaign]"
M7_T0=$(psql_app "select now()")
M7_PARCEL="pc_smoke_m7_tc_1"  # a fresh TC parcel: no crop cycle, no journal and so no withdrawal, and no dedupe hit
M7_DAY_SQL="(now() at time zone 'Asia/Ho_Chi_Minh')::date"  # the campaign day is the Vietnam calendar day
M7_NONE="00000000-0000-0000-0000-000000000000"
M7_NOTICE=""
M7_HARVEST=""

# Restores what this smoke changed: the campaigns of the run, its proposals and their messages, the notices of the run and
# the fresh parcel. The agent itself is left to llm_cleanup, which recreates it without the test overrides and stops it.
campaign_cleanup() {
  local rows="select id from platform.agent_proposals where id in ('${M7_NOTICE:-$M7_NONE}','${M7_HARVEST:-$M7_NONE}') or subject_ids && array['$M7_PARCEL']"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($rows) or (chat_id=$TG_OWNER and created_at >= '$M7_T0')" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.campaigns where htx_code in ('TC','LB') and created_at >= '$M7_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code in ('TC','LB') and agent='daily-campaign' and started_at >= '$M7_T0'" >/dev/null 2>&1 || true
  psql_app "delete from notifications where created_at >= '$M7_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from parcels where id='$M7_PARCEL'" >/dev/null 2>&1 || true
}
# The EXIT trap of smoke-assistant is replaced, so this one chains it after the campaign cleanup.
trap 'campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# The evidence object the route checks: rows and the digest of their {table, id, sha256} in canonical JSON (evidenceDigest).
m7_evidence() {  # <rows json>
  python3 -c '
import hashlib, json, sys
rows = json.loads(sys.argv[1])
canon = json.dumps([{"table": r["table"], "id": r["id"], "sha256": r["sha256"]} for r in rows],
                   sort_keys=True, separators=(",", ":"), ensure_ascii=False)
print(json.dumps({"rows": rows, "sha256": hashlib.sha256(canon.encode()).hexdigest()}))' "$1"
}

# Posts one proposal through the internal route as the TC agent and prints its id. A dedupe answer has no id and fails.
m7_post() {  # <agent> <kind> <payload json> <evidence json>
  local body
  body="$(jq -nc --arg agent "$1" --arg kind "$2" --argjson payload "$3" --argjson evidence "$4" \
    '{agent: $agent, kind: $kind, payload: $payload, reason_vi: "Kiểm thử chiến dịch M7", evidence: $evidence}')"
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
}).catch((err) => { console.error(err); process.exit(1); });' "$M7_AT" "$body"
}

M7_AT=$(client_token TC)
[ -n "$M7_AT" ] || fail "agent token for TC is empty (campaign smoke)"

# The agent stays stopped while the proposals and the parcel are seeded (lesson 5 of M4).
$COMPOSE stop dxos-agent >/dev/null
# The earlier smokes leave many open TC proposals; with the 15-item cap the seeds below could fall out of the campaign
# (M7 CI). Their own cleanups still delete those rows on exit, whatever their status.
psql_app "update platform.agent_proposals set status = 'expired' where htx_code = 'TC' and status = 'proposed'" >/dev/null
psql_app "delete from platform.campaigns where htx_code='TC' and day = $M7_DAY_SQL" >/dev/null
psql_app "insert into parcels (id, parcel_code, household_id, crop_type, area_ha, updated_at) values
  ('$M7_PARCEL', 'P-TC-901', 'hh_tc_2', 'Chè Trung du', 0.5, now()) on conflict (id) do nothing" >/dev/null

# One low notice for managers (the sensor_silent template, as A2 files it) and one high harvest on the fresh parcel. Each
# subject is unique to this run, so the 24-hour dedupe of the route cannot answer with an old proposal.
M7_RUN=$(python3 -c 'import uuid; print(uuid.uuid4())')
M7_NOTICE_PAYLOAD="$(jq -nc --arg subject "sensor_silent:m7-$M7_RUN" \
  '{template: "sensor_silent", slots: {parcel_code: "P-TC-002", sensor: "soil_moisture", hours: 8}, subjects: [$subject]}')"
M7_NOTICE=$(m7_post field-watch notification.internal "$M7_NOTICE_PAYLOAD" "$(m7_evidence '[]')") \
  || fail "the internal notice was not accepted by the internal proposals route (campaign smoke)"
M7_HARVEST=$(m7_post harvest-ready harvest.approve "$(jq -nc --arg parcel "$M7_PARCEL" '{parcel_id: $parcel}')" \
  "$(m7_evidence "[{\"table\":\"parcels\",\"id\":\"$M7_PARCEL\",\"sha256\":\"m7-smoke-parcel\"}]")") \
  || fail "the harvest proposal was not accepted by the internal proposals route (campaign smoke)"
[ -n "$M7_NOTICE" ] && [ -n "$M7_HARVEST" ] || fail "campaign smoke seeds have no proposal ids"

# The agent starts with the stub as its provider; its first cycle files today's campaign (A9 at 06:00 and on start).
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

wait_psql "select count(*) from platform.campaign_items i join platform.campaigns c on c.id = i.campaign_id where c.htx_code='TC' and c.day = $M7_DAY_SQL and i.proposal_id in ('$M7_NOTICE','$M7_HARVEST')" "2" 90 \
  || fail "no TC campaign for today with both proposals within 180 s"
pass "A9 files today's TC campaign with the notice and the harvest"

# The campaign message to the linked manager, with the approve-all button taken from the stub's recorded keyboard.
tg_expect "$TG_OWNER" "Chiến dịch ngày" 0 || fail "no campaign message to the linked manager within 90 s"
M7_APPROVE_DATA="$(tg_button "$TG_OWNER" "Duyệt cả chiến dịch" 2>/dev/null || true)"
[ -n "$M7_APPROVE_DATA" ] || fail "the campaign message carries no 'Duyệt cả chiến dịch' button"
pass "the campaign message to the linked manager carries the approve-all button"

# Text of the newest message sent or edited to <chat> that contains <needle>: other messages (proposal syncs) can come
# after the one a step waits for.
tg_last_with() {  # <chat> <needle>
  stub_calls | python3 -c '
import json, sys
chat, needle = int(sys.argv[1]), sys.argv[2]
hits = [c["params"].get("text", "") for c in json.load(sys.stdin)
        if c["method"] in ("sendMessage", "editMessageText") and c["params"].get("chat_id") == chat and needle in c["params"].get("text", "")]
print(hits[-1] if hits else "")' "$1" "$2"
}

# Approve-all as the manager: the notice runs, the harvest waits for its own confirmation, and the message is edited.
n=$(tg_count "$TG_OWNER" "Đã duyệt chiến dịch")
tg_callback "$TG_OWNER" "$TG_OWNER" private "$M7_APPROVE_DATA" "cq-m7-approve-all"
tg_expect "$TG_OWNER" "Đã duyệt chiến dịch" "$n" || fail "the approve-all result was not edited into the campaign message within 90 s"
M7_RESULT="$(tg_last_with "$TG_OWNER" "Đã duyệt chiến dịch")"
assert_eq "$(python3 -c '
import re, sys
match = re.search(r"Đã duyệt chiến dịch: (\d+) việc đã chạy, (\d+) việc chờ xác nhận riêng, (\d+) việc chuyển người đủ quyền\.", sys.argv[1])
print("ok" if match and int(match.group(1)) >= 1 and int(match.group(2)) >= 1 else "bad")' "$M7_RESULT")" "ok" \
  "test 14: the approve-all result counts the notice as run and the harvest as waiting (got: $M7_RESULT)"

wait_psql "select status from platform.agent_proposals where id='$M7_NOTICE'" "executed" 45 \
  || fail "the internal notice was not executed by approve-all"
pass "approve-all runs the internal notice through DecideProposalUseCase"
assert_eq "$(psql_app "select status from platform.agent_proposals where id='$M7_HARVEST'")" "proposed" \
  "test 14: the high harvest stays proposed after approve-all"
wait_psql "select status from platform.campaigns where htx_code='TC' and day = $M7_DAY_SQL" "partial" 30 \
  || fail "the campaign did not become partial after approve-all"
pass "the TC campaign is partial after approve-all"
