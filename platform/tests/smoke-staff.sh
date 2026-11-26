#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Staff tasks (M10, agent A8) for TC and LB. The smoke acts as the staff app with curl and a dxos-staff-tc token: it pushes
# a roster and the attendance, seeds an executed harvest.approve, restarts the agent, and A8 proposes a staff.task.create
# with an assignee. The manager approves it from the stub's recorded keyboard; TC pulls it, LB pulls nothing (test 42), TC
# acknowledges it and the proposal is executed with the staff app's task id. Sourced by smoke-agentic.sh after
# smoke-mcp.sh, which took the Telegram relay down; it brings the relay up itself and does not run on its own. It adds no
# PASS line to make platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-staff.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

# The staff routes and the Telegram approval need the web (as the MCP smoke).
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: staff smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi

echo "[staff]"
M10_T0=$(psql_app "select now()")
M10_PARCEL="pc_smoke_m10_tc_1"  # a fresh TC parcel, so no earlier proposal is about it
M10_SOURCE=$(python3 -c 'import uuid; print(uuid.uuid4())')  # the seeded, already executed harvest.approve
M10_TODAY_SQL="(now() at time zone 'Asia/Ho_Chi_Minh')::date"
M10_TASK_ID="smoke-task-m10"
M10_PROPOSAL=""

# Restores what this smoke changed: its proposals and their messages, the roster, the attendance, the parcel, the two staff
# clients and the Telegram link. The EXIT trap of smoke-mcp is replaced, so this one chains it after its own cleanup.
staff_cleanup() {
  local rows="select id from platform.agent_proposals where htx_code='TC' and (id='$M10_SOURCE' or (agent='staff-tasks' and created_at >= '$M10_T0'))"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent='staff-tasks' and started_at >= '$M10_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.staff_roster where htx_code in ('TC','LB') and staff_ref like 'smoke-%'" >/dev/null 2>&1 || true
  psql_app "delete from platform.staff_attendance where htx_code in ('TC','LB') and reported_at >= '$M10_T0'" >/dev/null 2>&1 || true
  psql_app "delete from parcels where id='$M10_PARCEL'" >/dev/null 2>&1 || true
  ./dxos staff disable TC >/dev/null 2>&1 || true
  ./dxos staff disable LB >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_links where telegram_user_id=$TG_OWNER" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_link_codes where code_hash='${TG_HASH:-none}'" >/dev/null 2>&1 || true
  telegram_relay_down >/dev/null 2>&1 || true
}
trap 'staff_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# `./dxos staff enable` prints the client id, the secret and the two addresses once, for the operator. The smoke keeps the secret in a variable
# and never prints it.
staff_token() {  # <HTX>: a client-credentials token of the cooperative's staff client
  local out cid csec
  out="$(./dxos staff enable "$1")" || fail "dxos staff enable $1 failed"
  cid="$(printf '%s\n' "$out" | sed -n 's/^  Client id: *//p')"
  csec="$(printf '%s\n' "$out" | sed -n 's/^  Secret: *//p')"
  [ -n "$cid" ] && [ -n "$csec" ] || fail "dxos staff enable $1 printed no client id or secret"
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" -d "client_id=$cid" --data-urlencode "client_secret=$csec" | jq -r '.access_token // empty'
}

# The staff routes are on the internal port, so the call goes through the web container like the other internal smokes.
# It prints the status, a space and the body.
staff_api() {  # <token> <method> <path> [json body]
  $COMPOSE exec -T web node -e '
const [token, method, path, body] = process.argv.slice(1);
fetch("http://apisix:9081" + path, {
  method,
  headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  body: body || undefined,
}).then(async (res) => { console.log(res.status + " " + (await res.text())); })
  .catch((err) => { console.error(err); process.exit(1); });' "$@"
}
staff_status() { printf '%s' "${1%% *}"; }
staff_body() { printf '%s' "${1#* }"; }

M10_TC=$(staff_token TC)
M10_LB=$(staff_token LB)
[ -n "$M10_TC" ] && [ -n "$M10_LB" ] || fail "staff client_credentials tokens empty"
assert_eq "$(python3 -c 'import base64,json,sys; p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4); t=json.loads(base64.urlsafe_b64decode(p)); print(t.get("azp","") + ":" + t.get("htx_code","") + ":" + str("staff-sync" in t.get("realm_access",{}).get("roles",[])))' "$M10_TC")" \
  "dxos-staff-tc:TC:True" "the TC staff token carries azp dxos-staff-tc, htx_code TC and the staff-sync role"
# The staff app is outside the compose network, so its routes are served on the public port too (D14), with a token only.
assert_http 401 "public port 9080 refuses /api/internal/staff/tasks without a token" -- "$GATEWAY/api/internal/staff/tasks"
assert_http 200 "public port 9080 serves /api/internal/staff/tasks to the TC staff token" -- -H "Authorization: Bearer $M10_TC" "$GATEWAY/api/internal/staff/tasks"
for refused in "$M10_TC GET /api/internal/agent/staff/inputs staff token on the agent routes" \
               "$(client_token TC) GET /api/internal/staff/tasks agent token on the staff routes"; do
  read -r token method path label <<<"$refused"
  case "$(staff_status "$(staff_api "$token" "$method" "$path")")" in
    401|403) pass "$label is refused" ;;
    *) fail "$label was not refused" ;;
  esac
done

# The staff app's roster and today's attendance. Another cooperative's client has its own.
assert_eq "$(staff_status "$(staff_api "$M10_TC" PUT /api/internal/staff/roster \
  '{"staff":[{"staff_ref":"smoke-s1","name":"Smoke An","department":"Sản xuất","active":true},{"staff_ref":"smoke-s2","name":"Smoke Bình","department":"Kỹ thuật","active":true}]}')")" "200" "the staff app pushes its roster"
M10_DAY=$(psql_app "select $M10_TODAY_SQL")
assert_eq "$(staff_status "$(staff_api "$M10_TC" PUT /api/internal/staff/attendance "{\"day\":\"$M10_DAY\",\"present\":3}")")" "200" "the staff app pushes today's attendance"
case "$(staff_status "$(staff_api "$M10_TC" PUT /api/internal/staff/attendance '{"day":"2020-01-01","present":3}')")" in
  400|422) pass "attendance for another day is refused" ;;
  *) fail "attendance for another day was not refused" ;;
esac
assert_eq "$(psql_app "select count(*) from platform.staff_roster where htx_code='TC' and staff_ref in ('smoke-s1','smoke-s2') and active")" "2" "the TC roster holds both smoke staff members"
assert_eq "$(psql_app "select present from platform.staff_attendance where htx_code='TC' and day = $M10_TODAY_SQL")" "3" "today's TC attendance is 3"

# The agent stays stopped while the harvest is seeded (lesson 5 of M4); it restarts after the seeds.
$COMPOSE stop dxos-agent >/dev/null
./dxos agent enable TC >/dev/null
psql_app "insert into parcels (id, parcel_code, household_id, crop_type, area_ha, updated_at) values
  ('$M10_PARCEL', 'P-TC-910', 'hh_tc_2', 'Chè Trung du', 0.5, now()) on conflict (id) do nothing" >/dev/null
# An executed harvest.approve, decided an hour ago: A8 turns it into a task due today.
psql_app "insert into platform.agent_proposals (id, htx_code, agent, kind, payload, reason_vi, evidence, risk, status, dedupe_key, subject_ids, created_at, expires_at, decided_by, decided_at, decision_channel)
  values ('$M10_SOURCE', 'TC', 'harvest-ready', 'harvest.approve', jsonb_build_object('parcel_id', '$M10_PARCEL'), 'Kiểm thử việc nhân sự M10', '{}'::jsonb, 'high', 'executed',
    'harvest.approve:[\"$M10_PARCEL\"]', array['$M10_PARCEL'], now() - interval '2 hours', now() + interval '1 day', 'smoke-manager', now() - interval '1 hour', 'web')" >/dev/null

# The linked manager: the link comes first, so the new proposal is queued to the owner.
psql_app "update platform.telegram_links set unlinked_at = now() where telegram_user_id in ($TG_OWNER, $TG_STRANGER) and unlinked_at is null" >/dev/null
telegram_relay_up
telegram_link_owner
wait_stub "any(x['method'] == 'sendMessage' and x['params'].get('chat_id') == $TG_OWNER for x in c)" \
  && pass "manager's Telegram account linked for the staff task" || fail "no welcome message after /start (staff smoke)"

# The agent starts with the stub as its provider; its first cycle runs A8 (05:50 and on start, no LLM call).
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

M10_FIND="select id from platform.agent_proposals where htx_code='TC' and kind='staff.task.create' and agent='staff-tasks' and created_at >= '$M10_T0' and payload->'source'->>'proposal_id' = '$M10_SOURCE'"
wait_psql "select count(*) from ($M10_FIND) t" "1" 90 || fail "A8 proposed no staff.task.create for the seeded harvest within 180 s"
M10_PROPOSAL=$(psql_app "$M10_FIND")
pass "A8 proposes a staff task for the executed harvest"
assert_eq "$(psql_app "select status || ':' || (payload->>'title_vi') || ':' || (payload->>'due_date' = $M10_TODAY_SQL::text)::text || ':' || (payload->>'assignee_ref' like 'smoke-s%')::text from platform.agent_proposals where id='$M10_PROPOSAL'")" \
  "proposed:Hái chè thửa P-TC-910:true:true" "the proposal is open, due today, titled by the parcel code and has an assignee from the roster"
assert_eq "$(psql_app "select count(*) from platform.agent_runs where htx_code='TC' and agent='staff-tasks' and status='ok' and started_at >= '$M10_T0'")" "1" "A8 recorded one finished run"

# Nothing reaches the staff app before the approval.
assert_eq "$(staff_body "$(staff_api "$M10_TC" GET /api/internal/staff/tasks)" | jq -r --arg id "$M10_PROPOSAL" '[.data.tasks[] | select(.proposal_id == $id)] | length')" "0" "the staff app sees nothing before the approval"

# The manager approves from Telegram, with the button the stub recorded for this proposal. The proposal is then waiting for the staff app.
M10_DATA=""
for _ in $(seq 1 45); do M10_DATA="$(telegram_approve_data_for "$M10_PROPOSAL" 2>/dev/null || true)"; [ -n "$M10_DATA" ] && break; sleep 2; done
[ -n "$M10_DATA" ] || fail "no approve button for the staff task within 90 s"
n=$(tg_count "$TG_OWNER" "Đã gửi app nhân sự")
tg_callback "$TG_OWNER" "$TG_OWNER" private "$M10_DATA" "cq-m10-approve"
wait_psql "select status from platform.agent_proposals where id='$M10_PROPOSAL'" "sent_to_staff_app" 45 \
  || fail "the staff task is not sent_to_staff_app after the Telegram approval"
pass "the approved staff task waits for the staff app"
tg_expect "$TG_OWNER" "Đã gửi app nhân sự" "$n" || fail "the Telegram message does not say 'Đã gửi app nhân sự'"
pass "the manager's message says the task was sent to the staff app"

# The staff app pulls. TC gets the task; LB, another cooperative, gets nothing and cannot acknowledge it (test 42).
M10_PULL="$(staff_api "$M10_TC" GET /api/internal/staff/tasks)"
assert_eq "$(staff_status "$M10_PULL")" "200" "the TC staff app pulls its tasks"
assert_eq "$(staff_body "$M10_PULL" | jq -r --arg id "$M10_PROPOSAL" '[.data.tasks[] | select(.proposal_id == $id and .title_vi == "Hái chè thửa P-TC-910" and (.assignee_ref | startswith("smoke-s")))] | length')" "1" "the pulled task has the proposal id, the title and the assignee"
M10_LB_PULL="$(staff_api "$M10_LB" GET /api/internal/staff/tasks)"
assert_eq "$(staff_status "$M10_LB_PULL")" "200" "the LB staff app pulls its tasks"
assert_eq "$(staff_body "$M10_LB_PULL" | jq -r '.data.tasks | length')" "0" "test 42: LB's pull holds none of TC's tasks"
assert_eq "$(staff_status "$(staff_api "$M10_LB" POST "/api/internal/staff/tasks/$M10_PROPOSAL/ack" "{\"task_id\":\"$M10_TASK_ID\"}")")" "404" "test 42: LB cannot acknowledge TC's task (404)"
assert_eq "$(psql_app "select status from platform.agent_proposals where id='$M10_PROPOSAL'")" "sent_to_staff_app" "the foreign acknowledgement changed nothing"

# TC creates the task and acknowledges it with its own id. A repeat with the same id answers 200 again; another id is refused.
assert_eq "$(staff_status "$(staff_api "$M10_TC" POST "/api/internal/staff/tasks/$M10_PROPOSAL/ack" "{\"task_id\":\"$M10_TASK_ID\"}")")" "200" "the TC staff app acknowledges the task"
assert_eq "$(psql_app "select status || ':' || external_ref from platform.agent_proposals where id='$M10_PROPOSAL'")" "executed:$M10_TASK_ID" "the proposal is executed with the staff app's task id"
assert_eq "$(staff_status "$(staff_api "$M10_TC" POST "/api/internal/staff/tasks/$M10_PROPOSAL/ack" "{\"task_id\":\"$M10_TASK_ID\"}")")" "200" "a repeated acknowledgement with the same id is idempotent (200)"
assert_eq "$(staff_status "$(staff_api "$M10_TC" POST "/api/internal/staff/tasks/$M10_PROPOSAL/ack" '{"task_id":"another-task"}')")" "409" "an acknowledgement with another task id is refused (409)"
assert_eq "$(staff_body "$(staff_api "$M10_TC" GET /api/internal/staff/tasks)" | jq -r --arg id "$M10_PROPOSAL" '[.data.tasks[] | select(.proposal_id == $id)] | length')" "0" "an acknowledged task is not pulled again"

# A roster push replaces the roster: a member who is missing becomes inactive and is never suggested again.
assert_eq "$(staff_status "$(staff_api "$M10_TC" PUT /api/internal/staff/roster '{"staff":[{"staff_ref":"smoke-s1","name":"Smoke An","department":"Sản xuất","active":true}]}')")" "200" "the staff app pushes a shorter roster"
assert_eq "$(psql_app "select active from platform.staff_roster where htx_code='TC' and staff_ref='smoke-s2'")" "f" "the member missing from the roster is inactive"
