#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Platform smoke tests. Run from the repo root via `make platform-smoke`.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh

echo "[postgres]"
assert_eq "$(psql_app "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('postgis','vector')")" "postgis,vector" "postgis and vector extensions installed"

echo "[storage]"
set -a; source docker/.env.local; set +a
NODE_PATH=apps/web/node_modules node platform/tests/s3-compat.cjs \
  && pass "S3 bucket + presigned PUT/GET round-trip via minio client" \
  || fail "S3 round-trip"
