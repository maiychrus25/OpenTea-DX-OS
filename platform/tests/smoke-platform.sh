#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Platform smoke tests. Run from the repo root via `make platform-smoke`.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh

echo "[postgres]"
assert_eq "$(psql_app "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('postgis','vector')")" "postgis,vector" "postgis and vector extensions installed"
