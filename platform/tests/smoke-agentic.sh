#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Agentic layer checks that need the web: the agent smoke, then the Telegram smoke. Run after make web-up;
# smoke-platform.sh sources the same files earlier and skips their web parts when the web is not up yet.
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
export SMOKE_REQUIRE_WEB=1
source platform/tests/smoke-agent.sh
source platform/tests/smoke-telegram.sh
source platform/tests/smoke-llm.sh
source platform/tests/smoke-agents.sh
source platform/tests/smoke-assistant.sh
source platform/tests/smoke-campaign.sh
source platform/tests/smoke-improvement.sh
source platform/tests/smoke-mcp.sh
source platform/tests/smoke-staff.sh
source platform/tests/smoke-autopilot.sh
source platform/tests/smoke-strategy.sh
echo "agentic smoke passed"
