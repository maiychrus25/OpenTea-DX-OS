#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Platform smoke tests. Run from the repo root via `make platform-smoke`.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh
source platform/tests/tokens.sh

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
curl -s -D - -o /dev/null -X POST "$GATEWAY/api/data/graphql" | grep -qi '^x-request-id:' && pass "X-Request-Id present" || fail "X-Request-Id missing"

echo "[data]"
PRISMA_URL="postgresql://${POSTGRES_USER:-agrimarket}:${POSTGRES_PASSWORD:-your_password_here}@localhost:5432/agrimarket"
# n8n shares the public schema, so a fresh DB is "non-empty" for Prisma (P3005): apply migration SQL and baseline it.
if [ -z "$(psql_app "select to_regclass('_prisma_migrations')")" ]; then
  for m in apps/web/prisma/migrations/*/; do
    $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q < "${m}migration.sql" >/dev/null || fail "apply ${m}"
    (cd apps/web && DATABASE_URL="$PRISMA_URL" npx prisma migrate resolve --applied "$(basename "$m")" >/dev/null) || fail "baseline ${m}"
  done
fi
(cd apps/web && DATABASE_URL="$PRISMA_URL" npx prisma migrate deploy >/dev/null) && pass "prisma migrate deploy" || fail "prisma migrate deploy"
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

TM=$(user_token manager_tc); TL=$(user_token manager_lb); TF=$(user_token farmer_tc); TN=$(user_token manager_tc dxos-noaud)
[ -n "$TM" ] && [ -n "$TL" ] && [ -n "$TF" ] && [ -n "$TN" ] || fail "data tokens empty"
Q='{households{id}}'
assert_eq "$(ids "$(gql "$TM" "$Q" manager)" '.data.households[].id')" "hh_tc_1,hh_tc_2" "manager_tc sees only TC households"
assert_eq "$(ids "$(gql "$TL" "$Q" manager)" '.data.households[].id')" "hh_lb_1" "manager_lb sees only LB households"
R=$(gql "$TF" '{households{id} parcels{household_id} lots{htx_profile_id}}')
assert_eq "$(ids "$R" '.data.households[].id')" "hh_tc_1" "farmer_tc sees only own household"
assert_eq "$(ids "$R" '.data.parcels[].household_id')" "hh_tc_1" "farmer_tc sees only own parcels"
assert_eq "$(ids "$R" '.data.lots[].htx_profile_id')" "htx_tc" "farmer_tc sees only own lot"
# A role the token does not carry is denied outright (no data), never silently downgraded to broader access.
printf '%s' "$(gql "$TM" "$Q")" | jq -e '(.data.households // []) | length == 0' >/dev/null && pass "manager_tc without role header gets no data (default farmer not granted)" || fail "manager_tc without role header got data"
printf '%s' "$(gql "$TM" "$Q" farmer)" | jq -e '(.data.households // []) | length == 0' >/dev/null && pass "manager_tc claiming farmer role gets no data" || fail "manager_tc claiming farmer role got data"
gql "$TM" 'mutation{insert_households_one(object:{id:"x",name:"x",phone:"1"}){id}}' manager | jq -e 'has("errors")' >/dev/null && pass "mutation rejected" || fail "mutation not rejected"
gql "$TM" '{__schema{types{name}}}' manager | jq -e '[.data.__schema.types[].name]|map(select(.=="partners"))|length==0' >/dev/null && pass "partners not exposed" || fail "partners exposed"
gql "$TN" "$Q" | jq -e '.errors[0].message|test("JWT|audience";"i")' >/dev/null && pass "token without dx-os-core audience rejected" || fail "no-audience token not rejected"
