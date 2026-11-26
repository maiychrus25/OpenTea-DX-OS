#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Mini-app factory smoke (M13, tests 26 to 30), run by the CI job "Builder Smoke" on a stack that has the web, the agent
# image, the Telegram relay and the dxos-builder image (make builder-image). Nothing calls a real model:
#   - A12 runs with the replay provider; its recording answers a request that mentions "kho phân bón" with the
#     gen-fertiliser-stock spec (platform/agent/replay/app-builder.json);
#   - the builder runs the replay tool DXOS_BUILDER_TOOL=replay:fertiliser-stock, a real app from platform/builder/replay/.
# Main path: the TC manager asks on Telegram, approves the spec, ./dxos builder --once builds it (all gates green), four
# screenshots reach the stub, the manager approves miniapp.install, the worker installs it, and only TC can open it.
# Then the fixtures with-script and extra-dependency fail with no catalogue row (26), with-agent-actions fails the
# manifest gate (29), a hand-made ENABLE row for a failed build ends FAILED (28), the app cannot reach another app but
# reaches apisix (27), and the build container sees no core secrets and no way out but the proxy (30).
# Run from the repo root: bash platform/tests/smoke-builder.sh. Seeds data, so it stops dxos-agent first (lesson 5).
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh
source platform/tests/tokens.sh
source platform/tests/lib-telegram.sh
set -a; source docker/.env.local; set +a
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

PROJECT="${COMPOSE_PROJECT_NAME:-docker}"
RUNTIME="docker/runtime/$PROJECT"
APP_GW="http://apisix:9081"
BUILDER_TOOL="${DXOS_BUILDER_SMOKE_TOOL:-replay:fertiliser-stock}"
BUILDER_IMAGE="${DXOS_BUILDER_IMAGE:-opentea-dx-os/builder:local}"
BUILDER_PROXY_URL="${DXOS_BUILDER_PROXY_URL:-http://dxos-builder-proxy:3128}"
REPLAY_DIR="${DXOS_BUILDER_AGENT_REPLAY_DIR:-$PWD/platform/agent/replay}"
APP_ID="gen-fertiliser-stock"
REQUEST_TEXT="cần app theo dõi kho phân bón của hợp tác xã"
BUILDER_T0=$(psql_app "select now()")
WORKER_PID=""
HELLO_WAS_INSTALLED=0
AGENT_OVERRIDE="$(mktemp)"
WORKER_OUT="$(mktemp)"

# ---- helpers (the Telegram ones mirror smoke-assistant.sh, which only runs inside smoke-agentic.sh) ------------------
wait_psql() {  # <sql> <expected> [tries, 2 s apart]
  local got=""
  for _ in $(seq 1 "${3:-40}"); do got="$(psql_app "$1")"; [ "$got" = "$2" ] && return 0; sleep 2; done
  return 1
}
agent_env() { $COMPOSE --profile tools run --rm -T --no-deps dxos-agent-env cat "/run/dxos-agent/$1.env"; }
client_token() {  # <HTX>
  local creds cid csec
  creds="$(agent_env "$1")"
  cid=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_AGENT_CLIENT_ID=//p')
  csec=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_AGENT_CLIENT_SECRET=//p')
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" -d "grant_type=client_credentials" \
    -d "client_id=$cid" -d "client_secret=$csec" | jq -r '.access_token // empty'
}
tg_text() {  # <chat> <text>
  TG_UPDATE_ID=$((TG_UPDATE_ID + 1))
  curl -sf -X POST "$STUB/control/updates" -H 'Content-Type: application/json' -d "$(python3 -c '
import json, sys
uid, sender, text = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
print(json.dumps({"update_id": uid, "message": {"message_id": uid, "chat": {"id": sender, "type": "private"}, "from": {"id": sender}, "text": text}}, ensure_ascii=False))' \
    "$TG_UPDATE_ID" "$1" "$2")" >/dev/null
}
tg_count() {  # <chat> <needle>: messages to <chat> whose text contains <needle>
  stub_calls | python3 -c '
import json, sys
chat, needle = int(sys.argv[1]), sys.argv[2]
print(sum(1 for c in json.load(sys.stdin) if c["method"] in ("sendMessage", "editMessageText")
          and c["params"].get("chat_id") == chat and needle in c["params"].get("text", "")))' "$1" "$2"
}
tg_expect() {  # <chat> <needle> <before>
  for _ in $(seq 1 45); do [ "$(tg_count "$1" "$2")" -gt "$3" ] && return 0; sleep 2; done
  return 1
}
approve_by_telegram() {  # <label> <proposal id>: presses the signed approve button the stub recorded
  local data=""
  for _ in $(seq 1 45); do data="$(telegram_approve_data_for "$2" 2>/dev/null)" && [ -n "$data" ] && break; sleep 2; done
  [ -n "$data" ] || fail "$1: no approve button for the proposal within 90 s"
  tg_callback "$TG_OWNER" "$TG_OWNER" private "$data" "cq-m13-$1"
  wait_psql "select status from platform.agent_proposals where id='$2'" "executed" 45 \
    && pass "$1 approved from Telegram and executed" || fail "$1 proposal not executed after the Telegram approval"
}
app_curl() { $COMPOSE exec -T hasura curl "$@"; }
manager_token() { user_token "$1"; }
app_containers() { docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=app-$1"; }
spec_json() {  # <app id>: a valid C2 spec for a request inserted by hand
  jq -nc --arg id "$1" '{app_id: $id, name_vi: "Thử cổng", summary_vi: "App thử cho cổng kiểm tra.",
    roles: [{role: "manager", can_vi: "Xem và ghi."}], screens: [{path: "/", title_vi: "Trang chính", purpose_vi: "Xem danh sách."}],
    data: [], agent_reads: []}'
}
# Runs ./dxos builder --once for a request inserted by hand, with one of the failing replay fixtures.
build_fixture() {  # <fixture> <app id>
  psql_app "insert into platform.app_build_requests (htx_code, requested_by, request_text, status, app_id, spec)
    values ('TC', 'smoke', 'kiểm thử cổng $1', 'spec_approved', '$2', '$(spec_json "$2")'::jsonb)" >/dev/null
  DXOS_BUILDER_TOOL="replay:$1" ./dxos builder --once >>"$WORKER_OUT" 2>&1 || true
}

start_worker() {
  ./dxos worker >>"$WORKER_OUT" 2>&1 & WORKER_PID=$!
  for _ in $(seq 1 60); do [ "$(cat "$RUNTIME/worker.lock/pid" 2>/dev/null)" = "$WORKER_PID" ] && return 0; sleep 0.5; done
  fail "worker did not take its lock within 30 s"
}
stop_worker() {
  [ -z "$WORKER_PID" ] || kill "$WORKER_PID" 2>/dev/null || true
  for _ in $(seq 1 40); do kill -0 "$WORKER_PID" 2>/dev/null || break; sleep 1; done
  WORKER_PID=""
}

# ---- cleanup: whatever fails, leave no generated app, request, proposal or replay agent behind -----------------------
builder_cleanup() {
  stop_worker
  ./dxos remove "$APP_ID" --purge >/dev/null 2>&1 || true
  [ "$HELLO_WAS_INSTALLED" != 0 ] || ./dxos remove hello --purge >/dev/null 2>&1 || true
  local proposals="select id from platform.agent_proposals where htx_code='TC' and kind in ('app.spec.approve','miniapp.install') and created_at >= '$BUILDER_T0'"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($proposals)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($proposals)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($proposals)" >/dev/null 2>&1 || true
  psql_app "delete from platform.app_requests where app_id like 'gen-%' and htx_code='TC'" >/dev/null 2>&1 || true
  psql_app "delete from platform.app_enablements where app_id like 'gen-%'" >/dev/null 2>&1 || true
  psql_app "delete from platform.app_catalog where owner_htx = 'TC' and id like 'gen-%'" >/dev/null 2>&1 || true
  psql_app "delete from platform.app_build_requests where htx_code = 'TC' and created_at >= '$BUILDER_T0'" >/dev/null 2>&1 || true  # builds and files cascade
  psql_app "delete from platform.telegram_conversations where kind = 'app_answer' and created_at >= '$BUILDER_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_settings where htx_code='TC' and agent='app-builder'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent='app-builder' and started_at >= '$BUILDER_T0'" >/dev/null 2>&1 || true
  rm -rf "generated-apps/TC" "$RUNTIME/generated"
  rm -f "$AGENT_OVERRIDE"
  # The agent comes back without the replay override, then stops as the other smokes leave it; the store cards return.
  $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null 2>&1 && $COMPOSE stop dxos-agent >/dev/null 2>&1 || true
  $COMPOSE --profile builder stop dxos-builder-proxy >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_links where telegram_user_id=$TG_OWNER" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_link_codes where code_hash='${TG_HASH:-none}'" >/dev/null 2>&1 || true
  telegram_relay_down >/dev/null 2>&1 || true
  ./dxos agent disable TC >/dev/null 2>&1 || true
  $COMPOSE --profile tools run --rm -T --user "$(id -u):$(id -g)" dxos-cli catalog-sync >/dev/null 2>&1 || true
  rm -f "$WORKER_OUT"
}
trap builder_cleanup EXIT

# ---- setup ------------------------------------------------------------------------------------------------------------
curl -sf -o /dev/null "${WEB:-http://localhost:3000}/api/health" || fail "the web is not reachable (make web-up first)"
[ -f "$REPLAY_DIR/app-builder.json" ] || fail "A12 replay recording missing: $REPLAY_DIR/app-builder.json"
LISTED=$(./dxos list) || fail "./dxos list failed"
grep -qxF "$APP_ID" <<<"$(cut -f1 <<<"$LISTED")" && fail "$APP_ID is installed already; this smoke removes it, so run it on a clean stack"
grep -qxF hello <<<"$(cut -f1 <<<"$LISTED")" && HELLO_WAS_INSTALLED=1
kc_wait
ensure_user smoke_manager_tc manager TC
ensure_user smoke_manager_lb manager LB
if [ "$($COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tAc "select count(*) from parcels where id in ('pc_tc_1','pc_tc_2','pc_lb_1')")" != "3" ]; then
  $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q < platform/tests/fixtures/two-htx.sql >/dev/null
fi

# Lesson 5: nothing may read the tables between seeding and the agent's restart, so the agent is down while they are set up.
$COMPOSE stop dxos-agent >/dev/null 2>&1 || true
./dxos agent enable TC >/dev/null
psql_app "delete from platform.app_build_requests where htx_code = 'TC'" >/dev/null
psql_app "insert into platform.agent_settings (htx_code, agent, enabled, provider) values ('TC', 'app-builder', true, 'ollama')
  on conflict (htx_code, agent) do update set enabled = true, provider = 'ollama'" >/dev/null
# A12 takes a store app that shares two words with the request before it builds; clear the not-installed cards for this run
# (the worker's catalog-sync, and this script's cleanup, put them back).
psql_app "delete from platform.app_catalog where owner_htx is null and id not in (select id from platform.installed_apps)" >/dev/null

cat >"$AGENT_OVERRIDE" <<YAML
services:
  dxos-agent:
    environment:
      DXOS_AGENT_PROVIDER: replay
      DXOS_AGENT_REPLAY_DIR: /replay
    volumes:
      - $REPLAY_DIR:/replay:ro
YAML
telegram_relay_up
telegram_link_owner
wait_stub "any(x['method'] == 'sendMessage' and x['params'].get('chat_id') == $TG_OWNER for x in c)" \
  && pass "the TC manager is linked to the Telegram stub" || fail "no welcome message after /start within 60 s"
stub_reset
$COMPOSE -f "$AGENT_OVERRIDE" up -d --no-deps --force-recreate dxos-agent >/dev/null
pass "dxos-agent runs with the replay provider and A12's recording"

# ---- main path ----------------------------------------------------------------------------------------------------------
echo "[builder: request and spec]"
n=$(tg_count "$TG_OWNER" "Đã nhận yêu cầu")
tg_text "$TG_OWNER" "$REQUEST_TEXT"
tg_expect "$TG_OWNER" "Đã nhận yêu cầu" "$n" || fail "no 'Đã nhận yêu cầu' reply to the request within 90 s"
pass "the request is received through Telegram"
REQ=$(psql_app "select id from platform.app_build_requests where htx_code='TC' order by created_at desc limit 1")
[ -n "$REQ" ] || fail "no app_build_requests row for TC"
wait_psql "select status from platform.app_build_requests where id='$REQ'" "spec_proposed" 60 \
  || fail "A12 did not post a spec within 120 s (status: $(psql_app "select status from platform.app_build_requests where id='$REQ'"))"
assert_eq "$(psql_app "select app_id from platform.app_build_requests where id='$REQ'")" "$APP_ID" "A12 chose the build path and the app id $APP_ID"
SPEC_PROPOSAL=$(psql_app "select id from platform.agent_proposals where htx_code='TC' and kind='app.spec.approve' and status='proposed' and payload->>'request_id'='$REQ'")
[ -n "$SPEC_PROPOSAL" ] || fail "no app.spec.approve proposal for the request"
approve_by_telegram spec "$SPEC_PROPOSAL"
assert_eq "$(psql_app "select status from platform.app_build_requests where id='$REQ'")" "spec_approved" "the approved spec is the builder's only input"

echo "[builder: build]"
n=$(stub_calls | python3 -c 'import json,sys; print(sum(1 for c in json.load(sys.stdin) if c["method"] == "sendMediaGroup"))')
DXOS_BUILDER_TOOL="$BUILDER_TOOL" ./dxos builder --once >>"$WORKER_OUT" 2>&1 || { tail -n 40 "$WORKER_OUT" >&2; fail "./dxos builder --once failed"; }
assert_eq "$(psql_app "select status from platform.app_builds where request_id='$REQ'")" "passed" "the build passed"
assert_eq "$(psql_app "select (jsonb_array_length(gates) >= 7 and not exists (select 1 from jsonb_array_elements(gates) g where g->>'ok' <> 'true'))::text from platform.app_builds where request_id='$REQ'")" \
  "true" "every gate is green (at least seven)"
assert_eq "$(psql_app "select count(*) from platform.app_build_files where build_id=(select id from platform.app_builds where request_id='$REQ') and name like '%.png'")" "4" "the four screenshots are stored"
assert_eq "$(psql_app "select owner_htx from platform.app_catalog where id='$APP_ID'")" "TC" "the app is listed for TC only (owner_htx)"
[ -d "generated-apps/TC/$APP_ID/.git" ] && git -C "generated-apps/TC/$APP_ID" rev-parse -q --verify "refs/tags/v0.1.0" >/dev/null \
  && pass "the app is its own git repository with the tag v0.1.0" || fail "generated-apps/TC/$APP_ID has no v0.1.0 tag"
wait_stub "sum(1 for x in c if x['method'] == 'sendMediaGroup' and x['params'].get('chat_id') == $TG_OWNER and len(x.get('files', [])) == 4) > $n" 60 \
  && pass "four screenshots reach the Telegram stub as one album" || fail "no album of four photos at the stub within 120 s (does A12 announce the build?)"

echo "[builder: install]"
INSTALL_PROPOSAL=""
for _ in $(seq 1 30); do
  INSTALL_PROPOSAL=$(psql_app "select id from platform.agent_proposals where htx_code='TC' and kind='miniapp.install' and status='proposed' and payload->>'app_id'='$APP_ID'")
  [ -n "$INSTALL_PROPOSAL" ] && break
  sleep 2
done
[ -n "$INSTALL_PROPOSAL" ] || fail "no miniapp.install proposal for $APP_ID after the build"
start_worker
approve_by_telegram install "$INSTALL_PROPOSAL"
ENABLE_ID=$(psql_app "select id from platform.app_requests where app_id='$APP_ID' and htx_code='TC' and action='ENABLE'" | sed -n 1p)
[ -n "$ENABLE_ID" ] || fail "the approval queued no ENABLE request for $APP_ID"
wait_psql "select status from platform.app_requests where id='$ENABLE_ID'" "DONE" 90 \
  || { tail -n 30 "$WORKER_OUT" >&2; fail "the worker did not finish the install (status: $(psql_app "select status || ' ' || coalesce(error, '') from platform.app_requests where id='$ENABLE_ID'"))"; }
pass "the worker installed $APP_ID from its export"
TM_TC=$(manager_token smoke_manager_tc)
TM_LB=$(manager_token smoke_manager_lb)
for _ in $(seq 1 15); do
  [ "$(app_curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TM_TC" "$APP_GW/apps/$APP_ID/")" = 200 ] && break
  sleep 1
done
assert_eq "$(app_curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TM_TC" "$APP_GW/apps/$APP_ID/")" "200" "/apps/$APP_ID/ answers 200 for the TC manager"
assert_eq "$(app_curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TM_LB" "$APP_GW/apps/$APP_ID/")" "404" "the LB manager gets 404 on /apps/$APP_ID/"
assert_eq "$(psql_app "select coalesce(string_agg(htx_code, ','), '') from platform.app_enablements where app_id='$APP_ID'")" "TC" "the app is enabled for TC only"

# ---- test 27: the private network ------------------------------------------------------------------------------------
echo "[builder: private network, test 27]"
[ "$HELLO_WAS_INSTALLED" != 0 ] || ./dxos install miniapps/hello >/dev/null || fail "./dxos install miniapps/hello failed"
CID=$(app_containers "$APP_ID" | sed -n 1p)
[ -n "$CID" ] || fail "no container for app-$APP_ID"
docker exec "$CID" python -c '
import socket, sys
try:
    socket.create_connection(("app-hello", 8080), 3)
except OSError:
    sys.exit(0)
sys.exit(1)' && pass "from inside app-$APP_ID, app-hello:8080 is unreachable" || fail "app-$APP_ID reached another app (test 27)"
docker exec "$CID" python -c '
import urllib.error, urllib.request
try:
    urllib.request.urlopen("http://apisix:9081/", timeout=5)
except urllib.error.HTTPError:
    pass  # any HTTP answer means apisix is reachable
' && pass "from inside app-$APP_ID, apisix:9081 answers" || fail "app-$APP_ID cannot reach apisix:9081"
assert_eq "$(docker inspect -f '{{range $n, $v := .NetworkSettings.Networks}}{{$n}} {{end}}' "$CID" | tr ' ' '\n' | grep -c .)" "1" "the app is on exactly one network (its own)"

# ---- tests 26, 29, 28 -------------------------------------------------------------------------------------------------------
echo "[builder: failing fixtures, tests 26 28 29]"
build_fixture with-script gen-with-script
assert_eq "$(psql_app "select status from platform.app_build_requests where app_id='gen-with-script'")" "failed" "test 26: the fixture with a script ends failed"
assert_eq "$(psql_app "select count(*) from platform.app_catalog where id='gen-with-script'")" "0" "test 26: a failed build has no catalogue row"
assert_eq "$(psql_app "select exists (select 1 from platform.app_builds b, jsonb_array_elements(b.gates) g where b.app_id='gen-with-script' and g->>'name'='markup' and g->>'ok'='false')::text")" "true" \
  "test 26: the markup gate is the one that failed"
build_fixture extra-dependency gen-extra-dependency
assert_eq "$(psql_app "select status from platform.app_build_requests where app_id='gen-extra-dependency'")" "failed" "test 26: the fixture with an extra dependency ends failed"
assert_eq "$(psql_app "select count(*) from platform.app_catalog where id='gen-extra-dependency'")" "0" "test 26: no catalogue row for it either"
build_fixture with-agent-actions gen-with-agent-actions
assert_eq "$(psql_app "select exists (select 1 from platform.app_builds b, jsonb_array_elements(b.gates) g where b.app_id='gen-with-agent-actions' and g->>'name'='manifest' and g->>'ok'='false')::text")" "true" \
  "test 29: the fixture that declares agent actions fails the manifest gate"
assert_eq "$(psql_app "select count(*) from platform.app_catalog where id='gen-with-agent-actions'")" "0" "test 29: and is not listed"
# Test 28: nobody can queue an install for a build that did not pass; the worker refuses it again at claim time.
BAD_ID=$(psql_app "insert into platform.app_requests (app_id, htx_code, action, requested_by) values ('gen-with-script', 'TC', 'ENABLE', 'smoke') returning id" | sed -n 1p)
wait_psql "select status from platform.app_requests where id='$BAD_ID'" "FAILED" 30 || fail "test 28: the worker did not refuse the hand-made ENABLE row"
assert_eq "$(psql_app "select error from platform.app_requests where id='$BAD_ID'")" "Bản này chưa qua kiểm tra hoặc không thuộc HTX này" "test 28: refused with the check message"
assert_eq "$(psql_app "select count(*) from platform.app_enablements where app_id='gen-with-script'")" "0" "test 28: nothing was enabled"

# ---- test 30: the build container's world -----------------------------------------------------------------------------------
echo "[builder: isolation, test 30]"
PROBE="generated-apps/TC/$APP_ID/.dxos/env-probe.json"
[ -f "$PROBE" ] || fail "the replay build left no $PROBE"
if grep -Eq 'DXOS_|POSTGRES|KEYCLOAK|TELEGRAM|AUTH_SECRET|HASURA|docker\.sock' "$PROBE"; then
  fail "test 30: the build container sees a core name or the Docker socket: $(grep -Eo 'DXOS_[A-Z_]*|POSTGRES[A-Z_]*|KEYCLOAK[A-Z_]*|TELEGRAM[A-Z_]*|AUTH_SECRET|HASURA[A-Z_]*|docker\.sock' "$PROBE" | sort -u | tr '\n' ' ')"
fi
pass "test 30: the build container's environment and mounts hold no core secret and no docker.sock"
$COMPOSE --profile builder up -d dxos-builder-proxy >/dev/null
docker run --rm --network "${PROJECT}_dxos-builder-net" --entrypoint python "$BUILDER_IMAGE" -c '
import socket, sys
try:
    socket.create_connection(("postgres", 5432), 3)
except OSError:
    sys.exit(0)
sys.exit(1)' && pass "test 30: from the build network, postgres:5432 is unreachable" || fail "test 30: the build network reaches postgres"
docker run --rm --network "${PROJECT}_dxos-builder-net" --entrypoint python "$BUILDER_IMAGE" -c '
import http.client, sys, urllib.parse
proxy = urllib.parse.urlparse(sys.argv[1])
conn = http.client.HTTPConnection(proxy.hostname, proxy.port, timeout=10)
conn.request("CONNECT", "example.com:443")
sys.exit(0 if conn.getresponse().status == 403 else 1)' "$BUILDER_PROXY_URL" \
  && pass "test 30: example.com through the proxy answers 403" || fail "test 30: the proxy did not refuse example.com with 403"
echo "builder smoke passed"
