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
ensure_user manager_tc manager TC
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
[ "$code" != 401 ] && pass "valid token passes gateway ($code)" || fail "valid token rejected"
assert_http "200 204" "CORS preflight without token" -- -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' "$GATEWAY/api/data/graphql"
curl -s -D - -o /dev/null -X POST "$GATEWAY/api/data/graphql" | grep -qi '^x-request-id:' && pass "X-Request-Id present" || fail "X-Request-Id missing"
