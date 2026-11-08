#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Assert helpers for platform smoke tests.
GATEWAY="${GATEWAY:-http://localhost:9080}"
COMPOSE="docker compose -f docker/docker-compose.yml"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

assert_eq() { # actual expected msg
  if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (expected '$2', got '$1')"; fi
}

# assert_http "200 204" msg -- <curl args...>
assert_http() {
  local codes="$1" msg="$2"; shift 3
  local got; got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  case " $codes " in *" $got "*) pass "$msg";; *) fail "$msg (expected one of '$codes', got '$got')";; esac
}

psql_app() { $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tAc "$1"; }
