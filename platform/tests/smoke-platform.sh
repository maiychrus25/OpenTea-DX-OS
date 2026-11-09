#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Platform smoke tests. Run from the repo root via `make platform-smoke`.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh
source platform/tests/tokens.sh

command -v jq >/dev/null || { echo "jq is required (brew/apt install jq)"; exit 1; }
[ -d apps/web/node_modules/minio ] || { echo "Run: (cd apps/web && npm install --no-audit --no-fund)"; exit 1; }

echo "[postgres]"
assert_eq "$(psql_app "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('postgis','vector')")" "postgis,vector" "postgis and vector extensions installed"

echo "[storage]"
set -a; source docker/.env.local; set +a
NODE_PATH=apps/web/node_modules node platform/tests/s3-compat.cjs \
  && pass "S3 bucket + presigned PUT/GET round-trip via minio client" \
  || fail "S3 round-trip"

echo "[identity setup]"
kc_wait
ensure_client dxos-smoke dx-os-core,roles,profile
ensure_client dxos-noaud roles,profile
ensure_user manager_tc manager TC
ensure_user manager_lb manager LB
ensure_user manager_none manager
ensure_user farmer_tc farmer TC
pass "smoke client and user ready"

echo "[gateway]"
for p in /api/data/graphql /api/workflow/ping /api/ai/disease/health; do
  assert_http 401 "no token -> 401 on $p" -- -X POST "$GATEWAY$p"
done
T=$(user_token manager_tc)
# Alter the FIRST signature char: the last base64url char carries padding bits, so changing it can leave the signature bytes intact.
SIG="${T##*.}"; FIRST="${SIG:0:1}"; SWAP=A; [ "$FIRST" = A ] && SWAP=B
assert_http 401 "tampered token -> 401" -- -X POST -H "Authorization: Bearer ${T%.*}.${SWAP}${SIG:1}" "$GATEWAY/api/data/graphql"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"query":"{__typename}"}' "$GATEWAY/api/data/graphql")
[[ "$code" =~ ^[1-5][0-9]{2}$ && "$code" != 401 ]] && pass "valid token passes gateway ($code)" || fail "valid token rejected or gateway down ($code)"
assert_http "200 204" "CORS preflight without token" -- -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' "$GATEWAY/api/data/graphql"
HDRS=$(curl -s -D - -o /dev/null -X POST "$GATEWAY/api/data/graphql")
grep -qi '^x-request-id:' <<<"$HDRS" && pass "X-Request-Id present" || fail "X-Request-Id missing"
PREFLIGHT=$(curl -s -D - -o /dev/null -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type,x-hasura-role' "$GATEWAY/api/data/graphql")
grep -i '^access-control-allow-headers:' <<<"$PREFLIGHT" | grep -qi 'x-hasura-role' && pass "CORS preflight allows x-hasura-role" || fail "CORS preflight does not allow x-hasura-role"
for p in /api/workflow/ping /api/ai/disease/health; do
  assert_http 401 "token without dx-os-core audience -> 401 on $p" -- -X POST -H "Authorization: Bearer $(user_token manager_tc dxos-noaud)" "$GATEWAY$p"
done

echo "[data]"
# make platform-up already ran migrate + platform-init before Hasura started; Hasura must serve the tables with no restart.
got=$($COMPOSE --profile tools run --rm -e POSTGRES_USER=agrimarket -e 'POSTGRES_PASSWORD=p@ss/w:rd' -e POSTGRES_DB=agrimarket --entrypoint node migrate /app/database-url.js)
assert_eq "$got" "postgresql://agrimarket:p%40ss%2Fw%3Ard@postgres:5432/agrimarket" "migrate URL-encodes the password"
TM0=$(user_token manager_tc); [ -n "$TM0" ] || fail "manager_tc token empty"
hasura_ok=fail
for _ in $(seq 1 15); do
  R=$(curl -s -X POST "$GATEWAY/api/data/graphql" -H "Authorization: Bearer $TM0" -H 'x-hasura-role: manager' -H 'Content-Type: application/json' -d '{"query":"{htx_profiles(limit:1){id}}"}')
  printf '%s' "$R" | jq -e 'has("data") and (has("errors")|not)' >/dev/null 2>&1 && { hasura_ok=pass; break; }
  sleep 2
done
[ "$hasura_ok" = pass ] && pass "Hasura serves htx_profiles after migrate (no restart)" || fail "Hasura does not serve htx_profiles: $R"
$COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q < platform/tests/fixtures/two-htx.sql >/dev/null && pass "fixture loaded" || fail "fixture load"
FARMER_ID=$(user_id farmer_tc); [ -n "$FARMER_ID" ] || fail "farmer_tc id empty"
psql_app "update households set keycloak_user_id='$FARMER_ID' where id='hh_tc_1'" >/dev/null

# gql <token> <query> [role]: prints the raw JSON response
gql() {
  local h=(); [ -n "${3:-}" ] && h=(-H "x-hasura-role: $3")
  curl -s -X POST "$GATEWAY/api/data/graphql" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    "${h[@]}" -d "$(jq -nc --arg q "$2" '{query:$q}')"
}
# ids <json> <jq path>: sorted comma-joined ids; prints "ERRORS:<json>" if the response has errors (so assert_eq fails)
ids() { printf '%s' "$1" | jq -e 'has("errors")|not' >/dev/null || { printf 'ERRORS:%s' "$1"; return 0; }; printf '%s' "$1" | jq -r "[$2] | sort | join(\",\")"; }

TM=$(user_token manager_tc); TL=$(user_token manager_lb); TF=$(user_token farmer_tc); TN=$(user_token manager_tc dxos-noaud); TX=$(user_token manager_none)
[ -n "$TM" ] && [ -n "$TL" ] && [ -n "$TF" ] && [ -n "$TN" ] && [ -n "$TX" ] || fail "data tokens empty"
Q='{households{id}}'
for _ in $(seq 1 60); do gql "$TM" "$Q" manager | jq -e '.data.households' >/dev/null 2>&1 && break; sleep 2; done
assert_eq "$(ids "$(gql "$TM" "$Q" manager)" '.data.households[].id')" "hh_tc_1,hh_tc_2" "manager_tc sees only TC households"
assert_eq "$(ids "$(gql "$TL" "$Q" manager)" '.data.households[].id')" "hh_lb_1" "manager_lb sees only LB households"
R=$(gql "$TF" '{households{id} parcels{household_id} lots{htx_profile_id}}')
assert_eq "$(ids "$R" '.data.households[].id')" "hh_tc_1" "farmer_tc sees only own household"
assert_eq "$(ids "$R" '.data.parcels[].household_id')" "hh_tc_1" "farmer_tc sees only own parcels"
assert_eq "$(ids "$R" '.data.lots[].htx_profile_id')" "htx_tc" "farmer_tc sees only own lot"
# A role the token does not carry is denied outright (no data), never silently downgraded to broader access.
printf '%s' "$(gql "$TM" "$Q")" | jq -e '(.data.households // []) | length == 0' >/dev/null && pass "manager_tc without role header gets no data (default farmer not granted)" || fail "manager_tc without role header got data"
printf '%s' "$(gql "$TM" "$Q" farmer)" | jq -e '((.data.households // []) | length == 0) and ((has("errors") | not) or (.errors[0].extensions.code == "access-denied"))' >/dev/null && pass "manager_tc claiming farmer role gets no data" || fail "manager_tc claiming farmer role got data"
assert_eq "$(ids "$(gql "$TX" "$Q" manager)" '.data.households[].id')" "" "manager without htx_code sees no households (empty-code HTX excluded)"
assert_eq "$(ids "$(gql "$TX" '{htx_profiles{id}}' manager)" '.data.htx_profiles[].id')" "" "manager without htx_code sees no htx_profiles"
gql "$TM" 'mutation{insert_households_one(object:{id:"x",name:"x",phone:"1"}){id}}' manager | jq -e 'has("errors")' >/dev/null && pass "mutation rejected" || fail "mutation not rejected"
gql "$TM" '{__schema{types{name}}}' manager | jq -e '[.data.__schema.types[].name]|map(select(.=="partners"))|length==0' >/dev/null && pass "partners not exposed" || fail "partners exposed"
gql "$TN" "$Q" | jq -e '.errors[0] | (.extensions.code == "invalid-jwt") and (.message | contains("JWTNotInAudience"))' >/dev/null && pass "token without dx-os-core audience rejected" || fail "no-audience token not rejected"

# A client-supplied Hasura admin secret must be stripped at the edge (never escalate to admin).
R=$(curl -s -X POST "$GATEWAY/api/data/graphql" -H "Authorization: Bearer $TF" -H "x-hasura-admin-secret: $HASURA_GRAPHQL_ADMIN_SECRET" -H 'Content-Type: application/json' -d '{"query":"{__schema{mutationType{name}} households{id}}"}')
printf '%s' "$R" | jq -e '.data.__schema.mutationType == null' >/dev/null && pass "admin secret header stripped (no mutation_root)" || fail "admin secret header honoured: $R"
assert_eq "$(ids "$R" '.data.households[].id')" "hh_tc_1" "farmer_tc with admin secret header still sees only own household"

echo "[audit]"
AID=$(psql_app "select audit.record_event('smoke','PING','smoke/ping','{\"n\":1}'::jsonb)")
[ -n "$AID" ] && pass "record_event returned id $AID" || fail "record_event returned no id"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact"
for stmt in "update audit.events set actor='x' where id=$AID" "delete from audit.events where id=$AID" "truncate audit.events"; do
  out=$(psql_app "BEGIN; $stmt; ROLLBACK;" 2>&1) || true
  case "$out" in *append-only*) pass "append-only blocks: $stmt";; *) fail "not blocked: $stmt ($out)";; esac
done
assert_eq "$(printf "BEGIN;\nALTER TABLE audit.events DISABLE TRIGGER dxos_audit_append_only;\nUPDATE audit.events SET actor='tampered' WHERE id=$AID;\nSELECT first_bad_id FROM audit.verify_chain();\nROLLBACK;\n" | $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tA -q | grep -v '^$')" "$AID" "tamper detected at the modified row"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after rollback"
for _ in 1 2 3; do psql_app "select audit.record_event('smoke','PING','smoke/mid','{}'::jsonb)" >/dev/null; done
MID=$(psql_app "select id from (select id from audit.events order by id desc limit 3) t order by id limit 1 offset 1")
NEXT=$(psql_app "select min(id) from audit.events where id > $MID")
assert_eq "$(printf "BEGIN;\nALTER TABLE audit.events DISABLE TRIGGER dxos_audit_append_only;\nDELETE FROM audit.events WHERE id=$MID;\nSELECT first_bad_id FROM audit.verify_chain();\nROLLBACK;\n" | $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tA -q | grep -v '^$')" "$NEXT" "deleted middle row detected at the following row"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after delete rollback"
MAXID=$(psql_app "select max(id) from audit.events")
assert_eq "$(printf "BEGIN;\nALTER TABLE audit.events DISABLE TRIGGER dxos_audit_append_only;\nDELETE FROM audit.events WHERE id=$MAXID;\nSELECT first_bad_id FROM audit.verify_chain();\nROLLBACK;\n" | $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tA -q | grep -v '^$')" "$MAXID" "deleted tail row detected via chain head"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after tail rollback"
out=$(psql_app "BEGIN; UPDATE audit.chain_head SET last_id = last_id - 1; ROLLBACK;" 2>&1) || true
case "$out" in *"can only advance"*) pass "chain_head cannot move backwards";; *) fail "chain_head rewind not blocked ($out)";; esac
# Repeatable-read session A with a stale snapshot must not fork the chain after B commits.
FIFO=$(mktemp -u); mkfifo "$FIFO"; RROUT=$(mktemp); RRPID=""
rr_cleanup() { exec 3>&-; if [ -n "$RRPID" ]; then kill "$RRPID" 2>/dev/null || true; fi; rm -f "$FIFO" "$RROUT"; }
trap rr_cleanup EXIT
$COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tA < "$FIFO" > "$RROUT" 2>&1 &
RRPID=$!
exec 3> "$FIFO"
echo "BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT 'RR_READY';" >&3
for _ in $(seq 1 60); do grep -q RR_READY "$RROUT" && break; sleep 0.5; done
grep -q RR_READY "$RROUT" || fail "RR session A never started"
psql_app "select audit.record_event('smoke','PING','smoke/rr-b','{}'::jsonb)" >/dev/null
echo "select audit.record_event('smoke','PING','smoke/rr-a','{}'::jsonb);" >&3
echo "ROLLBACK;" >&3; exec 3>&-
for _ in $(seq 1 60); do kill -0 "$RRPID" 2>/dev/null || break; sleep 0.5; done
grep -q 'could not serialize access' "$RROUT" && pass "repeatable-read append raises serialization error" || fail "repeatable-read append did not fail: $(cat "$RROUT")"
rr_cleanup; RRPID=""; trap - EXIT
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after repeatable-read race"
# Row triggers on business tables (task 2)
assert_eq "$(psql_app "select count(*)>=1 from audit.events where table_name='households' and op='INSERT' and row_id='hh_tc_1'")" "t" "fixture insert audited"
UM=$(psql_app "select coalesce(max(id),0) from audit.events")
psql_app "update households set address='Smoke street' where id='hh_tc_2'" >/dev/null
assert_eq "$(psql_app "select count(*) from audit.events where id>$UM and table_name='households' and op='UPDATE' and row_id='hh_tc_2' and new_data->>'address'='Smoke street'")" "1" "update audited exactly once with new_data"
CM=$(psql_app "select coalesce(max(id),0) from audit.events")
CPIDS=""
for w in 1 2; do
  ( for i in $(seq 1 20); do echo "update households set address='conc-$w-$i' where id='hh_tc_1';"; done | $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q >/dev/null ) &
  CPIDS="$CPIDS $!"
done
( sleep 60; kill $CPIDS 2>/dev/null ) & WD=$!
CFAIL=0; for p in $CPIDS; do wait "$p" || CFAIL=1; done
pkill -P "$WD" 2>/dev/null; kill "$WD" 2>/dev/null; wait "$WD" 2>/dev/null || true
assert_eq "$CFAIL" "0" "concurrent writer sessions finished cleanly"
assert_eq "$(psql_app "select count(*) from audit.events where id>$CM and table_name='households' and row_id='hh_tc_1' and op='UPDATE'")" "40" "40 concurrent updates audited"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after concurrent writers"
# Non-audited table: rolled back so no row persists.
MD=$(printf "BEGIN;\nSELECT coalesce(max(id),0) FROM audit.events;\nINSERT INTO market_data(id,source,commodity,metric,value,unit,period) VALUES (gen_random_uuid(),'SMOKE','smoke','smoke',1,'u','smoke');\nSELECT count(*) FROM audit.events WHERE table_name='market_data';\nROLLBACK;\n" | $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tA -q | grep -v '^$' | tail -1)
assert_eq "$MD" "0" "non-audited table market_data creates no event"
for _ in 1 2; do $COMPOSE run --rm platform-init >/dev/null 2>&1 && pass "platform-init re-run ok" || fail "platform-init re-run failed"; done
assert_eq "$(psql_app "select count(*) from pg_trigger where tgrelid='audit.events'::regclass and not tgisinternal and tgenabled='O'")" "2" "exactly 2 enabled triggers on audit.events"
assert_eq "$(psql_app "select count(*) from pg_trigger where tgrelid='audit.chain_head'::regclass and not tgisinternal and tgenabled='O'")" "3" "chain_head guard triggers present"
for t in htx_profiles households parcels parcel_crop_cycles journal_entries journal_activities lots lot_parcels disease_reports; do
  assert_eq "$(psql_app "select count(*) from pg_trigger where tgname='dxos_audit_row' and tgrelid='public.$t'::regclass")" "1" "audit row trigger on $t"
done

echo "[quarantine]"
S3T="node platform/tests/s3-tool.cjs"
export NODE_PATH=apps/web/node_modules
QDIR=$(mktemp -d); RUN="$(date +%s)-$$"
# EICAR key is unique per run: identical bytes under an old key would reuse a previous (key, etag) scan row.
EICAR_KEY="smoke/Lô thử nghiệm/eicar test $RUN.txt"; CLEAN_KEY="smoke/clean $RUN.txt"
EICAR_P1='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR'; EICAR_P2='-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
printf '%s%s' "$EICAR_P1" "$EICAR_P2" > "$QDIR/eicar.txt"   # assembled at runtime, never stored whole
printf 'clean smoke file %s\n' "$RUN" > "$QDIR/clean.txt"
q_cleanup() { $S3T rm dxos-quarantine "agrimarket-docs/$EICAR_KEY" 2>/dev/null || true; $S3T rm agrimarket-docs "$CLEAN_KEY" 2>/dev/null || true; rm -rf "$QDIR"; }
trap q_cleanup EXIT
Q_BEFORE=$(psql_app "select count(*) from audit.events where op='QUARANTINE' and row_id='agrimarket-docs/$EICAR_KEY'")
$S3T put agrimarket-docs "$EICAR_KEY" "$QDIR/eicar.txt" && $S3T put agrimarket-docs "$CLEAN_KEY" "$QDIR/clean.txt" && pass "uploaded EICAR and clean test files" || fail "upload test files"
quarantined=0
for _ in $(seq 1 60); do
  if ! $S3T exists agrimarket-docs "$EICAR_KEY" && $S3T exists dxos-quarantine "agrimarket-docs/$EICAR_KEY"; then quarantined=1; break; fi
  sleep 0.5
done
assert_eq "$quarantined" "1" "infected file moved to dxos-quarantine within 30s"
assert_eq "$(psql_app "select status || ':' || (coalesce(signature,'') <> '')::text from audit.file_scans where bucket='agrimarket-docs' and key='$EICAR_KEY' order by scanned_at desc limit 1")" "infected:true" "file_scans: infected with signature"
CLEAN_COUNT=0
for _ in $(seq 1 60); do
  CLEAN_COUNT=$(psql_app "select count(*) from audit.file_scans where bucket='agrimarket-docs' and key='$CLEAN_KEY' and status='clean'")
  [ "$CLEAN_COUNT" = "1" ] && break
  sleep 0.5
done
assert_eq "$CLEAN_COUNT" "1" "file_scans: clean file recorded clean (unique key per run)"
$S3T exists agrimarket-docs "$CLEAN_KEY" && pass "clean file still present" || fail "clean file was removed"
assert_eq "$(psql_app "select count(*) from audit.events where op='QUARANTINE' and row_id='agrimarket-docs/$EICAR_KEY'")" "$((Q_BEFORE + 1))" "QUARANTINE audit event recorded"
# Identical bytes under the same key (same etag as the infected row) must be quarantined again.
$S3T put agrimarket-docs "$EICAR_KEY" "$QDIR/eicar.txt" || fail "re-upload EICAR"
requarantined=0
for _ in $(seq 1 60); do
  if ! $S3T exists agrimarket-docs "$EICAR_KEY"; then requarantined=1; break; fi
  sleep 0.5
done
assert_eq "$requarantined" "1" "identical re-upload quarantined again within 30s"
$S3T exists dxos-quarantine "agrimarket-docs/$EICAR_KEY" && pass "quarantine copy exists after re-quarantine" || fail "quarantine copy missing after re-quarantine"
assert_eq "$(psql_app "select count(*) from audit.events where op='QUARANTINE' and row_id='agrimarket-docs/$EICAR_KEY'")" "$((Q_BEFORE + 2))" "second QUARANTINE audit event recorded"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain intact after quarantine"
assert_eq "$(psql_app "select count(*) from pg_stat_activity where application_name='dxos-scanner' and state='idle in transaction'")" "0" "scanner holds no idle-in-transaction session"
# SeaweedFS must reject (PreconditionFailed) a copy whose copy-source-if-match etag is wrong.
$S3T copy-mismatch agrimarket-docs "$CLEAN_KEY" dxos-quarantine "smoke-mismatch-$RUN" && pass "copy with wrong match_etag rejected (copy-source-if-match honoured)" || fail "copy-source-if-match not honoured or unexpected error"
$S3T rm dxos-quarantine "smoke-mismatch-$RUN" 2>/dev/null || true
# Archives clamd can only judge by heuristics: nested deeper than MaxRecursion and encrypted must be quarantined (fail closed).
python3 - "$QDIR/eicar.txt" "$QDIR/nested.zip" <<'PYEOF'
import sys, zipfile
data = open(sys.argv[1], 'rb').read()
name = 'eicar.txt'
for _ in range(21):  # MaxRecursion is 17
    path = sys.argv[2]
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr(name, data)
    data, name = open(path, 'rb').read(), 'inner.zip'
PYEOF
(cd "$QDIR" && zip -q -P smoke-pass encrypted.zip eicar.txt)   # zip is preinstalled on macOS and ubuntu runners
NESTED_KEY="smoke/nested $RUN.zip"; ENC_KEY="smoke/encrypted $RUN.zip"
q_cleanup() { for k in "$EICAR_KEY" "$NESTED_KEY" "$ENC_KEY"; do $S3T rm dxos-quarantine "agrimarket-docs/$k" 2>/dev/null || true; $S3T rm agrimarket-docs "$k" 2>/dev/null || true; done; rm -rf "$QDIR"; }
$S3T put agrimarket-docs "$NESTED_KEY" "$QDIR/nested.zip" && $S3T put agrimarket-docs "$ENC_KEY" "$QDIR/encrypted.zip" || fail "upload archive test files"
for pair in "nested (21 levels):$NESTED_KEY" "encrypted:$ENC_KEY"; do
  label=${pair%%:*}; key=${pair#*:}; moved=0
  for _ in $(seq 1 60); do
    if ! $S3T exists agrimarket-docs "$key" && $S3T exists dxos-quarantine "agrimarket-docs/$key"; then moved=1; break; fi
    sleep 0.5
  done
  assert_eq "$moved" "1" "$label EICAR zip quarantined within 30s"
done
q_cleanup; trap - EXIT

source platform/tests/smoke-dataops.sh

echo "[pins]"
unpinned=$(grep -nE '^\s*image:\s*(\S+:latest|[^:[:space:]#]+)(\s|$)' docker/docker-compose.yml || true)
[ -z "$unpinned" ] && pass "no unpinned images" || fail "unpinned images: $unpinned"
grep -qE '^\s*image:\s*quay\.io/keycloak/keycloak:24\.0\.[0-9]+\s*(#.*)?$' docker/docker-compose.yml && pass "keycloak pinned to patch tag" || fail "keycloak not pinned to 24.0.x"
