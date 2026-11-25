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
  # Platform Smoke already loaded the two-cooperative fixture and linked hh_tc_1 to smoke_farmer_tc. Reloading it would
  # drop that link, which the tea-tour story needs, so load it only when it is missing.
  if [ "$($COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tAc "select count(*) from parcels where id in ('pc_tc_1','pc_tc_2','pc_lb_1')")" != "3" ]; then
    $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q < platform/tests/fixtures/two-htx.sql >/dev/null
  fi
  gql() {
    local h=(); [ -n "${3:-}" ] && h=(-H "x-hasura-role: $3")
    curl -s -X POST "$GATEWAY/api/data/graphql" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
      "${h[@]}" -d "$(jq -nc --arg q "$2" '{query:$q}')"
  }
  ids() { printf '%s' "$1" | jq -e 'has("errors")|not' >/dev/null || { printf 'ERRORS:%s' "$1"; return 0; }; printf '%s' "$1" | jq -r "[$2] | sort | join(\",\")"; }
fi

echo "[agent]"
WEB="${WEB:-http://localhost:3000}"

agent_cleanup() {
  psql_app "delete from platform.agent_proposals where subject_ids && array['je_smoke_agent_tc','je_smoke_agent_lb']" >/dev/null 2>&1 || true
  [ -n "${AGENT_T0:-}" ] && psql_app "delete from platform.agent_runs where htx_code in ('TC','LB') and started_at >= '$AGENT_T0'" >/dev/null 2>&1 || true
  psql_app "delete from journal_entries where id in ('je_smoke_agent_tc','je_smoke_agent_lb')" >/dev/null 2>&1 || true
  ./dxos agent disable TC >/dev/null 2>&1 || true
  ./dxos agent disable LB >/dev/null 2>&1 || true
}
trap agent_cleanup EXIT

# The credential file as the agent reads it from the dxos-agent-env volume (the root helper reads it, not the host).
agent_env() {  # <HTX>
  $COMPOSE --profile tools run --rm -T --no-deps dxos-agent-env cat "/run/dxos-agent/$1.env"
}

client_token() {  # <HTX>
  local creds cid csec
  creds="$(agent_env "$1")"
  cid=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_AGENT_CLIENT_ID=//p')
  csec=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_AGENT_CLIENT_SECRET=//p')
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" \
    -d "client_id=$cid" \
    -d "client_secret=$csec" | jq -r '.access_token // empty'
}

AGENT_T0=$(psql_app "select now()")
./dxos agent enable TC >/dev/null
./dxos agent enable LB >/dev/null
agent_env TC >/dev/null && agent_env LB >/dev/null || fail "agent env files missing from the dxos-agent-env volume"
mode_tc=$($COMPOSE --profile tools run --rm -T --no-deps dxos-agent-env stat -c '%a %u:%g' /run/dxos-agent/TC.env)
assert_eq "$mode_tc" "600 10001:10001" "agent env file in the volume is mode 600, owned by the agent uid"
assert_eq "$(psql_app "select count(*) from platform.agent_settings where htx_code in ('TC','LB') and agent='journal-review' and enabled=true")" "2" "agent_settings enabled for TC and LB"

AT_TC=$(client_token TC)
AT_LB=$(client_token LB)
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

# Agent tokens are refused on user routes: spec §5.2 allows them only Hasura reads and /api/internal/agent/*.
for route in /api/workflow/smoke /api/ai/disease/health /api/ai/llm/v1/chat/completions; do
  assert_http "401 403" "agent token refused on $route" \
    -- -X POST -H "Authorization: Bearer $AT_TC" -H 'Content-Type: application/json' -d '{}' "$GATEWAY$route"
done

# Web boundary checks (test 1, test 34a, test 34b).
WEB_UP=0
if curl -sf -o /dev/null "$WEB/api/health"; then
  WEB_UP=1
elif [ "${SMOKE_REQUIRE_WEB:-0}" = "1" ]; then
  fail "web is not reachable at $WEB (SMOKE_REQUIRE_WEB=1)"
fi

if [ "$WEB_UP" = "1" ]; then
  # The agent reaches the web through APISIX, so its end-to-end checks need the web (CI runs them after make web-up).
  # dxos-agent is an optional group (make up-agent), so the smoke starts it; its first round reads the volume credentials.
  $COMPOSE up -d --no-deps dxos-agent >/dev/null
  agent_run_seen=0
  for _ in $(seq 1 30); do
    if [ "$(psql_app "select count(*) from platform.agent_runs where htx_code='TC' and agent='journal-review' and started_at >= '$AGENT_T0'")" -gt 0 ]; then
      agent_run_seen=1
      break
    fi
    sleep 3
  done
  if [ "$agent_run_seen" != 1 ]; then
    # Diagnostics for a loop that stopped moving: every thread's stack (faulthandler on SIGUSR1), resources, last log lines.
    $COMPOSE kill -s SIGUSR1 dxos-agent >/dev/null 2>&1 || true
    sleep 2
    docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} pids={{.PIDs}}' "$($COMPOSE ps -q dxos-agent)" || true
    $COMPOSE logs --no-log-prefix --tail 80 dxos-agent || true
  fi
  [ "$agent_run_seen" = 1 ] && pass "dxos-agent reads the volume credentials and starts a journal-review run for TC" \
    || fail "no journal-review run for TC within 90 s (dxos-agent did not read its credentials)"

  # M1 end to end: the seeded TC spraying entry has no activity details, so A1 proposes to return it (rule-only when no LLM).
  # 180 s, not 60: a bulletin written on the same CPU Ollama makes A1's LLM call wait; A1 then times out (60 s), retries
  # once (60 s) and falls back to its rule reasons, so the proposal can take about two minutes (CI 2026-11-25).
  agent_prop_seen=0
  for _ in $(seq 1 60); do
    if [ "$(psql_app "select count(*) from platform.agent_proposals where htx_code='TC' and agent='journal-review' and 'je_smoke_agent_tc' = any(subject_ids)")" -gt 0 ]; then
      agent_prop_seen=1
      break
    fi
    sleep 3
  done
  [ "$agent_prop_seen" = 1 ] && pass "dxos-agent proposes on the seeded TC journal entry (M1 end to end)" \
    || fail "dxos-agent made no proposal for je_smoke_agent_tc within 180 s"
  assert_eq "$(psql_app "select count(*) from platform.agent_proposals where 'je_smoke_agent_lb' = any(subject_ids) and htx_code <> 'LB'")" "0" "no proposal for an LB entry is filed under another cooperative"
  # Stop the agent so the manual internal-API checks below do not race with it on the same entry.
  $COMPOSE stop dxos-agent >/dev/null
  psql_app "delete from platform.agent_proposals where subject_ids && array['je_smoke_agent_tc','je_smoke_agent_lb']" >/dev/null

  TM_USER=$(user_token smoke_manager_tc)
  assert_http 403 "direct web POST /api/internal/agent/runs denied (test 34a)" \
    -- -X POST -H "Authorization: Bearer $AT_TC" -H 'X-Dxos-Gateway: forged' -H 'Content-Type: application/json' \
    -d '{"agent":"smoke-agent","trigger":"manual"}' "$WEB/api/internal/agent/runs"
  # The web is published on 3000, so the gateway secret must not open it: the dev value without a token is refused.
  assert_http "401 403" "direct web call with the dev gateway secret and no token refused" \
    -- -X POST -H 'X-Dxos-Gateway: dev-internal-gateway-secret' -H 'Content-Type: application/json' \
    -d '{"agent":"smoke-agent","trigger":"manual"}' "$WEB/api/internal/agent/runs"

  # Test 1: agent bearer token cannot invoke business write APIs on web.
  approve_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $AT_TC" -H 'Content-Type: application/json' \
    -d '{"entryIds":["je_smoke_agent_tc"]}' "$WEB/api/journal/batch-approve")
  case "$approve_code" in
    401|403) pass "agent token rejected on /api/journal/batch-approve ($approve_code, test 1)";;
    *) fail "agent token on /api/journal/batch-approve returned $approve_code";;
  esac

  # Evidence version 2 values of the seeded entry, in the shape the web re-hashes (platform/agent/tests/fixtures/evidence-vectors.json).
  JE_VALUES="$(psql_app "$(cat <<'SQL'
select json_build_object(
  'id', e.id, 'parcel_id', e.parcel_id, 'status', e.status,
  'entry_date', to_char(e.entry_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'activity_type', e.activity_type::text, 'notes', e.notes,
  'updated_at', to_char(e.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'activities', coalesce((select json_agg(json_build_object(
      'id', a.id, 'activity_detail', a.activity_detail, 'product_name', a.product_name, 'dosage', a.dosage,
      'withdrawal_days', a.withdrawal_days,
      'safe_harvest_date', to_char(a.safe_harvest_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by a.id collate "C")
    from journal_activities a where a.journal_entry_id = e.id), '[]'::json))
from journal_entries e where e.id = 'je_smoke_agent_tc'
SQL
)")"
  [ -n "$JE_VALUES" ] || fail "could not read evidence values of je_smoke_agent_tc"

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
  const [atTc, atLb, tmUser, jeValues] = process.argv.slice(1);
  const gw = "http://apisix:9081";

  const noTok = await fetch(gw + "/api/internal/agent/runs", { method: "POST" });
  assert.equal(noTok.status, 401, "missing token via 9081 must return 401");

  const userTok = await fetch(gw + "/api/internal/agent/runs", {
    method: "POST",
    headers: { Authorization: "Bearer " + tmUser, "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "journal-review", trigger: "manual" }),
  });
  assert.ok([401, 403].includes(userTok.status), "non-agent user token via 9081 must return 401 or 403");

  // A forged X-Dxos-Gateway must be overwritten by APISIX, so the valid request still succeeds.
  const startRes = await fetch(gw + "/api/internal/agent/runs", {
    method: "POST",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json", "X-Dxos-Gateway": "forged" },
    body: JSON.stringify({ htx_code: "LB", agent: "journal-review", trigger: "manual", provider: "replay" }),
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

  const values = JSON.parse(jeValues);
  const sha = (v) => crypto.createHash("sha256").update(canonical(v), "utf8").digest("hex");
  const rows = [{ table: "journal_entries", id: "je_smoke_agent_tc", sha256: sha(values), values }];
  const digest = sha(rows.map((r) => ({ table: r.table, id: r.id, sha256: r.sha256 })));

  // A row whose values do not match its hash is refused (the reviewer must see what was hashed).
  const forged = await fetch(gw + "/api/internal/agent/proposals", {
    method: "POST",
    headers: { Authorization: "Bearer " + atTc, "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, agent: "journal-review", kind: "journal.approve",
      payload: { entry_ids: ["je_smoke_agent_tc"] }, reason_vi: "Kiểm thử",
      evidence: { rows: [{ ...rows[0], values: { ...values, notes: "changed" } }], sha256: digest } }),
  });
  assert.equal(forged.status, 400, "a proposal whose evidence values do not match their hash must return 400");

  const propBody = {
    htx_code: "LB",
    run_id: runId,
    agent: "journal-review",
    kind: "journal.approve",
    payload: { entry_ids: ["je_smoke_agent_tc"] },
    reason_vi: "Khớp chuẩn kiểm thử M1b",
    evidence: { rows, sha256: digest },
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
' "$AT_TC" "$AT_LB" "$TM_USER" "$JE_VALUES" && pass "apisix:9081 internal agent flow + tenant isolation (test 34b)" || fail "apisix:9081 internal agent flow"

  assert_eq "$(psql_app "select htx_code from platform.agent_proposals where agent='journal-review' and status='proposed' and 'je_smoke_agent_tc' = any(subject_ids)")" "TC" "proposal stored under token htx_code=TC (body spoof ignored)"
else
  echo "SKIP: web not reachable at $WEB (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agent.sh)"
fi

# Disable revokes Keycloak client, removes env file and sets agent_settings.enabled=false.
LB_CREDS="$(agent_env LB)"
LB_CID=$(printf '%s\n' "$LB_CREDS" | sed -n 's/^DXOS_AGENT_CLIENT_ID=//p')
LB_CSEC=$(printf '%s\n' "$LB_CREDS" | sed -n 's/^DXOS_AGENT_CLIENT_SECRET=//p')
./dxos agent disable LB >/dev/null
agent_env LB >/dev/null 2>&1 && fail "LB env file still in the volume after disable" || pass "LB env file deleted after disable"
assert_eq "$(psql_app "select enabled from platform.agent_settings where htx_code='LB' and agent='journal-review'")" "f" "LB agent_settings disabled"
assert_http "400 401" "disabled LB client credentials rejected by Keycloak" \
  -- -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" -d "client_id=$LB_CID" -d "client_secret=$LB_CSEC"

agent_cleanup
trap - EXIT
