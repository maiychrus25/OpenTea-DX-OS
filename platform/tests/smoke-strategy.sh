#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Season strategy (M11, agent A11) for TC: a lot of the same quarter last year makes A11 draft this quarter's plan with a
# yield_kg goal at 105% of it and open a strategy.adopt proposal; the manager approves it from the stub's recorded keyboard
# and the plan is adopted; the next campaign puts the harvest item first; a plan posted with a target below last year
# carries the warning (test 37). Sourced by smoke-agentic.sh after smoke-autopilot.sh, which left the owner linked, the
# relay up and the agent running; it does not run on its own. It adds no PASS line to make platform-smoke, so
# smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-strategy.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

# The relay and the web are the same preconditions as the autopilot smoke, which skips without the web.
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: strategy smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi

echo "[strategy]"
M11_T0=$(psql_app "select now()")
M11_NONE="00000000-0000-0000-0000-000000000000"
M11_VN="now() at time zone 'Asia/Ho_Chi_Minh'"
M11_SEASON_SQL="(to_char($M11_VN, 'YYYY') || '-Q' || extract(quarter from $M11_VN)::int)"
M11_DAY_SQL="($M11_VN)::date"
# Last year's same quarter: the lot sits ten days into it, so no timezone edge reaches it.
M11_LY_START_SQL="(date_trunc('quarter', $M11_VN) - interval '1 year')"
M11_LOT="lot_smoke_m11_tc_1"
M11_PARCEL="pc_smoke_m11_tc_1"  # a fresh TC parcel for the harvest proposal, as the campaign smoke does
# Last year's yield of TC as the web adds it up: the actual weight, else the estimated one, of the lots harvested then.
M11_BASE_SQL="(select sum(coalesce(actual_weight_kg, estimated_weight_kg)) from lots where htx_profile_id = (select id from htx_profiles where htx_code='TC')
  and harvest_date >= $M11_LY_START_SQL and harvest_date < $M11_LY_START_SQL + interval '3 months')"
M11_PLAN_ROWS="select proposal_id from platform.strategy_plans where htx_code='TC' and proposal_id is not null and (season = $M11_SEASON_SQL or created_at >= '$M11_T0')"
M11_HARVEST=""
M11_NOTICE=""

# Restores what this smoke changed: the plans of the run and their proposals and messages, the harvest and the notice, the
# campaigns and runs of the run, the lot and the parcel. The agent itself is left to llm_cleanup. The EXIT trap of
# smoke-autopilot is replaced, so this one chains it after its own cleanup.
strategy_cleanup() {
  local rows="select id from platform.agent_proposals where id in ('${M11_HARVEST:-$M11_NONE}','${M11_NOTICE:-$M11_NONE}') or id in ($M11_PLAN_ROWS) or subject_ids && array['$M11_PARCEL']"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($rows) or (chat_id=$TG_OWNER and created_at >= '$M11_T0')" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.campaigns where htx_code='TC' and created_at >= '$M11_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.strategy_plans where htx_code='TC' and created_at >= '$M11_T0'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent in ('strategy','daily-campaign') and started_at >= '$M11_T0'" >/dev/null 2>&1 || true
  psql_app "delete from notifications where created_at >= '$M11_T0'" >/dev/null 2>&1 || true
  psql_app "delete from lots where id='$M11_LOT'" >/dev/null 2>&1 || true
  psql_app "delete from parcels where id='$M11_PARCEL'" >/dev/null 2>&1 || true
}
trap 'strategy_cleanup; autopilot_cleanup; staff_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# Posts a body to an internal route as the TC agent and prints the id of the answer; a status other than 201 fails.
m11_post() {  # <path> <body json>
  $COMPOSE exec -T web node -e '
const [token, path, body] = process.argv.slice(1);
fetch("http://apisix:9081" + path, {
  method: "POST",
  headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  body,
}).then(async (res) => {
  const json = await res.json().catch(() => ({}));
  const data = json?.data ?? json;
  if (res.status !== 201 || !data?.id) { console.error(res.status, JSON.stringify(json)); process.exit(1); }
  console.log(data.id);
}).catch((err) => { console.error(err); process.exit(1); });' "$M11_AT" "$1" "$2"
}

M11_AT=$(client_token TC)
[ -n "$M11_AT" ] || fail "agent token for TC is empty (strategy smoke)"

# The agent stays stopped while the history is seeded (lesson 5 of M4); it restarts after the seeds.
$COMPOSE stop dxos-agent >/dev/null
# Clean slate for this quarter: a draft or an adopted plan of the season means A11 has nothing to do on the restart.
psql_app "delete from platform.telegram_outbox where proposal_id in ($M11_PLAN_ROWS)" >/dev/null
psql_app "delete from platform.telegram_conversations where proposal_id in ($M11_PLAN_ROWS)" >/dev/null
psql_app "delete from platform.agent_proposals where id in ($M11_PLAN_ROWS)" >/dev/null
psql_app "delete from platform.strategy_plans where htx_code='TC' and season = $M11_SEASON_SQL" >/dev/null
psql_app "delete from lots where id='$M11_LOT'" >/dev/null
psql_app "insert into lots (id, lot_code, commodity, harvest_date, actual_weight_kg, htx_profile_id, updated_at) values
  ('$M11_LOT', 'SMOKE-M11-TC-1', 'Chè', $M11_LY_START_SQL + interval '10 days', 1000, (select id from htx_profiles where htx_code='TC'), now())" >/dev/null
M11_BASE=$(psql_app "select $M11_BASE_SQL")
[ -n "$M11_BASE" ] || fail "no last-year yield for TC after seeding the lot"

# The agent starts again with the stub as its provider; its first cycle drafts this quarter's plan (C5, on start).
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

wait_psql "select count(*) from platform.strategy_plans where htx_code='TC' and season = $M11_SEASON_SQL and status='draft'" "1" 90 \
  || fail "no TC draft plan for this quarter within 180 s"
pass "A11 drafts one plan for TC this quarter"
M11_PLAN=$(psql_app "select id from platform.strategy_plans where htx_code='TC' and season = $M11_SEASON_SQL and status='draft'")
assert_eq "$(psql_app "select (g->>'target')::numeric = floor($M11_BASE*1.05 + 0.5)::numeric and (g->>'baseline')::numeric = $M11_BASE::numeric
  from platform.strategy_plans p, jsonb_array_elements(p.goals) g where p.id='$M11_PLAN' and g->>'key'='yield_kg'")" "t" \
  "the yield_kg goal is 105% of last year's same quarter ($M11_BASE kg)"
M11_PROPOSAL=$(psql_app "select proposal_id from platform.strategy_plans where id='$M11_PLAN'")
assert_eq "$(psql_app "select kind || ':' || status || ':' || agent || ':' || (payload->>'plan_id') from platform.agent_proposals where id='$M11_PROPOSAL'")" \
  "strategy.adopt:proposed:strategy:$M11_PLAN" "the plan has an open strategy.adopt proposal of agent strategy"
assert_eq "$(psql_app "select jsonb_array_length(warnings) from platform.strategy_plans where id='$M11_PLAN'")" "0" "the rules' own plan carries no warning"

# The manager approves it from Telegram; the button is the one the stub recorded for this proposal.
approve_by_telegram "m11-strategy" "$M11_PROPOSAL"
assert_eq "$(psql_app "select status || ':' || (adopted_by is not null)::text || ':' || (adopted_at is not null)::text from platform.strategy_plans where id='$M11_PLAN'")" \
  "adopted:true:true" "the plan is adopted, with its approver and time, after the approval"

# Test 37: a plan whose target is below last year's same quarter carries the warning. No draft is left for the season,
# so the route answers 201.
M11_SEASON=$(psql_app "select $M11_SEASON_SQL")
M11_LOW_TARGET=$(python3 -c 'import sys; print(int(float(sys.argv[1]) * 0.5))' "$M11_BASE")
M11_LOW_BODY="$(jq -nc --arg season "$M11_SEASON" --argjson base "$M11_BASE" --argjson target "$M11_LOW_TARGET" \
  --arg run "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
  '{season: $season, goals: [{key: "yield_kg", label_vi: "Sản lượng", unit_vi: "kg", baseline: $base, target: $target, direction: "up"}],
    priorities: ["Kiểm thử cảnh báo M11"], initiatives: [], run_id: $run}')"
M11_LOW=$(m11_post /api/internal/agent/strategy/plans "$M11_LOW_BODY") \
  || fail "the low-target plan was not accepted by the strategy plans route (strategy smoke)"
assert_eq "$(psql_app "select (jsonb_array_length(warnings) >= 1 and warnings->>0 like 'Mục tiêu%thấp hơn cùng kỳ năm trước')::text from platform.strategy_plans where id='$M11_LOW'")" "true" \
  "test 37: a goal below last year's same quarter carries the warning"
assert_eq "$(psql_app "select a.status from platform.agent_proposals a join platform.strategy_plans p on p.proposal_id = a.id where p.id='$M11_LOW'")" "proposed" \
  "the warned plan waits as an ordinary open proposal"

# The next campaign: a harvest and a notice are posted while the agent is stopped, today's campaign is cleared, and the
# restarted agent files it with the harvest first (the adopted plan raises the harvest goal).
M7_AT=$(client_token TC)
$COMPOSE stop dxos-agent >/dev/null
psql_app "update platform.agent_proposals set status = 'expired' where htx_code = 'TC' and status = 'proposed'" >/dev/null
psql_app "delete from platform.campaigns where htx_code='TC' and day = $M11_DAY_SQL" >/dev/null
psql_app "insert into parcels (id, parcel_code, household_id, crop_type, area_ha, updated_at) values
  ('$M11_PARCEL', 'P-TC-911', 'hh_tc_2', 'Chè Trung du', 0.5, now()) on conflict (id) do nothing" >/dev/null
M11_RUN=$(python3 -c 'import uuid; print(uuid.uuid4())')
M11_NOTICE=$(m7_post field-watch notification.internal \
  "$(jq -nc --arg subject "sensor_silent:m11-$M11_RUN" '{template: "sensor_silent", slots: {parcel_code: "P-TC-002", sensor: "soil_moisture", hours: 8}, subjects: [$subject]}')" \
  "$(m7_evidence '[]')") || fail "the internal notice was not accepted by the internal proposals route (strategy smoke)"
M11_HARVEST=$(m7_post harvest-ready harvest.approve "$(jq -nc --arg parcel "$M11_PARCEL" '{parcel_id: $parcel}')" \
  "$(m7_evidence "[{\"table\":\"parcels\",\"id\":\"$M11_PARCEL\",\"sha256\":\"m11-smoke-parcel\"}]")") \
  || fail "the harvest proposal was not accepted by the internal proposals route (strategy smoke)"
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

wait_psql "select count(*) from platform.campaign_items i join platform.campaigns c on c.id = i.campaign_id where c.htx_code='TC' and c.day = $M11_DAY_SQL and i.proposal_id in ('$M11_NOTICE','$M11_HARVEST')" "2" 90 \
  || fail "no TC campaign for today with both proposals within 180 s"
assert_eq "$(psql_app "select i.proposal_id from platform.campaign_items i join platform.campaigns c on c.id = i.campaign_id where c.htx_code='TC' and c.day = $M11_DAY_SQL and i.position = 1")" "$M11_HARVEST" \
  "the campaign after the adoption puts the harvest item first"
