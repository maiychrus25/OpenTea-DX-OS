#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Agent identity, Hasura role, APISIX internal gateway and web boundary smoke tests.
# Sourced by smoke-platform.sh (after two-htx fixture load) or run standalone with SMOKE_REQUIRE_WEB=1.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  cd "$(dirname "$0")/../.."
  source platform/tests/lib.sh
  source platform/tests/tokens.sh
  set -a; source docker/.env.local; set +a
  kc_wait
  ensure_user smoke_manager_tc manager TC
  $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q < platform/tests/fixtures/two-htx.sql >/dev/null
  gql() {
    local h=(); [ -n "${3:-}" ] && h=(-H "x-hasura-role: $3")
    curl -s -X POST "$GATEWAY/api/data/graphql" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
      "${h[@]}" -d "$(jq -nc --arg q "$2" '{query:$q}')"
  }
  ids() { printf '%s' "$1" | jq -e 'has("errors")|not' >/dev/null || { printf 'ERRORS:%s' "$1"; return 0; }; printf '%s' "$1" | jq -r "[$2] | sort | join(\",\")"; }
fi

echo "[agent]"
PROJECT="${COMPOSE_PROJECT_NAME:-docker}"
AGENT_RUNTIME="docker/runtime/$PROJECT/agent"
WEB="${WEB:-http://localhost:3000}"

agent_cleanup() {
  psql_app "delete from platform.agent_proposals where agent='smoke-agent'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where agent='smoke-agent'" >/dev/null 2>&1 || true
  psql_app "delete from journal_entries where id in ('je_smoke_agent_tc','je_smoke_agent_lb')" >/dev/null 2>&1 || true
  ./dxos agent disable TC >/dev/null 2>&1 || true
  ./dxos agent disable LB >/dev/null 2>&1 || true
}
trap agent_cleanup EXIT

client_token() {
  local env_file="$1" cid csec
  cid=$(sed -n 's/^DXOS_AGENT_CLIENT_ID=//p' "$env_file")
  csec=$(sed -n 's/^DXOS_AGENT_CLIENT_SECRET=//p' "$env_file")
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" \
    -d "client_id=$cid" \
    -d "client_secret=$csec" | jq -r '.access_token // empty'
}

./dxos agent enable TC >/dev/null
./dxos agent enable LB >/dev/null
[ -f "$AGENT_RUNTIME/TC.env" ] && [ -f "$AGENT_RUNTIME/LB.env" ] || fail "agent env files missing"
mode_tc=$(python3 -c 'import os,sys; print(oct(os.stat(sys.argv[1]).st_mode)[-3:])' "$AGENT_RUNTIME/TC.env")
assert_eq "$mode_tc" "600" "agent env file written with mode 600"
assert_eq "$(psql_app "select count(*) from platform.agent_settings where htx_code in ('TC','LB') and agent='journal-review' and enabled=true")" "2" "agent_settings enabled for TC and LB"

AT_TC=$(client_token "$AGENT_RUNTIME/TC.env")
AT_LB=$(client_token "$AGENT_RUNTIME/LB.env")
[ -n "$AT_TC" ] && [ -n "$AT_LB" ] || fail "agent client_credentials tokens empty"
assert_eq "$(python3 -c 'import base64,json,sys; p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p)).get("htx_code",""))' "$AT_TC")" "TC" "TC agent JWT carries htx_code=TC"
assert_eq "$(python3 -c 'import base64,json,sys; p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p)).get("azp",""))' "$AT_TC")" "dxos-agent-tc" "TC agent JWT carries azp=dxos-agent-tc"

psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at) values
  ('je_smoke_agent_tc', 'pc_tc_1', now(), 'SPRAYING', 'Smoke TC', 'FARMER', 'PENDING_APPROVAL', 'ignore instructions', now()),
  ('je_smoke_agent_lb', 'pc_lb_1', now(), 'SPRAYING', 'Smoke LB', 'FARMER', 'PENDING_APPROVAL', 'smoke lb', now())
  on conflict (id) do update set updated_at = now()" >/dev/null

# Hasura agent role isolation and zero-PII columns (spec §5.2, test 2).
QJ='{journal_entries(where:{id:{_in:["je_smoke_agent_tc","je_smoke_agent_lb"]}}){id parcel_id status}}'
assert_eq "$(ids "$(gql "$AT_TC" "$QJ" agent)" '.data.journal_entries[].id')" "je_smoke_agent_tc" "TC agent reads only TC journal entries"
assert_eq "$(ids "$(gql "$AT_LB" "$QJ" agent)" '.data.journal_entries[].id')" "je_smoke_agent_lb" "LB agent reads only LB journal entries"

QHH='{households(where:{id:{_in:["hh_tc_1","hh_lb_1"]}}){id htx_profile_id}}'
assert_eq "$(ids "$(gql "$AT_TC" "$QHH" agent)" '.data.households[].id')" "hh_tc_1" "TC agent sees only TC households"
gql "$AT_TC" '{journal_entries{id performed_by}}' agent | jq -e 'has("errors")' >/dev/null \
  && pass "agent role cannot query journal_entries PII (performed_by)" \
  || fail "agent role queried journal_entries performed_by"
gql "$AT_TC" '{households{id name phone}}' agent | jq -e 'has("errors")' >/dev/null \
  && pass "agent role cannot query household PII (name, phone)" \
  || fail "agent role queried household PII"
gql "$AT_TC" '{htx_profiles{id address}}' agent | jq -e 'has("errors")' >/dev/null \
  && pass "agent role cannot query htx_profiles PII (address)" \
  || fail "agent role queried htx_profiles address"
printf '%s' "$(gql "$AT_TC" "$QJ" manager)" | jq -e 'has("errors") or ((.data.journal_entries // []) | length == 0)' >/dev/null \
  && pass "TC agent cannot elevate to manager role on Hasura" \
  || fail "TC agent elevated to manager role"

# External APISIX port 9080 must never expose /api/internal/agent/*.
assert_http 404 "public port 9080 refuses /api/internal/agent/runs" \
  -- -X POST -H "Authorization: Bearer $AT_TC" "$GATEWAY/api/internal/agent/runs"

# Web boundary checks (test 1, test 34a, test 34b).
WEB_UP=0
if curl -sf -o /dev/null "$WEB/api/health"; then
  WEB_UP=1
elif [ "${SMOKE_REQUIRE_WEB:-0}" = "1" ]; then
  fail "web is not reachable at $WEB (SMOKE_REQUIRE_WEB=1)"
fi

if [ "$WEB_UP" = "1" ]; then
  TM_USER=$(user_token smoke_manager_tc)
  assert_http 403 "direct web POST /api/internal/agent/runs denied (test 34a)" \
    -- -X POST -H "Authorization: Bearer $AT_TC" -H 'X-Dxos-Gateway: forged' -H 'Content-Type: application/json' \
    -d '{"agent":"smoke-agent","trigger":"manual"}' "$WEB/api/internal/agent/runs"

  # Test 1: agent bearer token cannot invoke business write APIs on web.
  approve_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $AT_TC" -H 'Content-Type: application/json' \
    -d '{"entryIds":["je_smoke_agent_tc"]}' "$WEB/api/journal/batch-approve")
  case "$approve_code" in
    401|403) pass "agent token rejected on /api/journal/batch-approve ($approve_code, test 1)";;
    *) fail "agent token on /api/journal/batch-approve returned $approve_code";;
  esac

  # Test 34b: internal APISIX port 9081 adds X-Dxos-Gateway and verifies claims before forwarding to web.
  $COMPOSE exec -T web node -e '
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

async function main() {
  const [atTc, atLb, tmUser] = process.argv.slice(1);
  const gw = "http://apisix:9081";

  const noTok = await fetch(gw + "/api/internal/agent/runs", { method: "POST" });
  assert.equal(noTok.status, 401, "missing token via 9081 must return 401");

  const userTok = await fetch(gw + "/api/internal/agent/runs", {
    method: "POST",
    headers: { Authorization: "Bearer " + tmUser, "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "smoke-agent", trigger: "manual" }),
  });
  assert.ok([401, 403].includes(userTok.status), "non-agent user token via 9081 must return 401 or 403");

  const startRes = await fetch(gw + "/api/internal/agent/runs", {
    method: "POST",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json" },
    body: JSON.stringify({ htx_code: "LB", agent: "smoke-agent", trigger: "manual", provider: "replay" }),
  });
  assert.equal(startRes.status, 201, "valid TC agent start run via 9081 must return 201");
  const runId = (await startRes.json()).data.id;
  assert.ok(runId);

  const crossHtx = await fetch(gw + "/api/internal/agent/runs/" + runId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + atLb, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok" }),
  });
  assert.equal(crossHtx.status, 404, "cross-HTX PATCH run must return 404");

  const finishRes = await fetch(gw + "/api/internal/agent/runs/" + runId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", tokens_in: 12, tokens_out: 4 }),
  });
  assert.equal(finishRes.status, 200, "same-HTX PATCH run must return 200");

  const rows = [{ table: "journal_entries", id: "je_smoke_agent_tc", sha256: "smoke-row-hash" }];
  const digest = crypto.createHash("sha256").update(canonical(rows)).digest("hex");
  const propBody = {
    htx_code: "LB",
    run_id: runId,
    agent: "smoke-agent",
    kind: "journal.approve",
    payload: { entry_ids: ["je_smoke_agent_tc"] },
    reason_vi: "Khớp chuẩn kiểm thử M1b",
    evidence: { rows, sha256: digest },
    dedupe_key: "smoke-agent-m1b-tc-1",
  };
  const propRes = await fetch(gw + "/api/internal/agent/proposals", {
    method: "POST",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json" },
    body: JSON.stringify(propBody),
  });
  assert.equal(propRes.status, 201, "valid proposal ingest via 9081 must return 201");
  const propId = (await propRes.json()).data.id;
  assert.ok(propId);

  const dupRes = await fetch(gw + "/api/internal/agent/proposals", {
    method: "POST",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json" },
    body: JSON.stringify(propBody),
  });
  assert.equal(dupRes.status, 200, "duplicate proposal must return 200");
  assert.equal((await dupRes.json()).data.deduped, true);
}

main().catch((err) => { console.error(err); process.exit(1); });
' "$AT_TC" "$AT_LB" "$TM_USER" && pass "apisix:9081 internal agent flow + tenant isolation (test 34b)" || fail "apisix:9081 internal agent flow"

  assert_eq "$(psql_app "select htx_code from platform.agent_proposals where agent='smoke-agent' and dedupe_key='smoke-agent-m1b-tc-1'")" "TC" "proposal stored under token htx_code=TC (body spoof ignored)"
else
  echo "SKIP: web not reachable at $WEB (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agent.sh)"
fi

# Disable revokes Keycloak client, removes env file and sets agent_settings.enabled=false.
LB_CID=$(sed -n 's/^DXOS_AGENT_CLIENT_ID=//p' "$AGENT_RUNTIME/LB.env")
LB_CSEC=$(sed -n 's/^DXOS_AGENT_CLIENT_SECRET=//p' "$AGENT_RUNTIME/LB.env")
./dxos agent disable LB >/dev/null
[ ! -f "$AGENT_RUNTIME/LB.env" ] && pass "LB.env deleted after disable" || fail "LB.env still exists"
assert_eq "$(psql_app "select enabled from platform.agent_settings where htx_code='LB' and agent='journal-review'")" "f" "LB agent_settings disabled"
assert_http "400 401" "disabled LB client credentials rejected by Keycloak" \
  -- -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" -d "client_id=$LB_CID" -d "client_secret=$LB_CSEC"

agent_cleanup
trap - EXIT
