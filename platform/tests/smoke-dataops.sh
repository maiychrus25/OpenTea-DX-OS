#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Data and events smoke sections. Sourced by smoke-platform.sh after [quarantine]; reuses its helpers,
# fixture (parcels P-TC-001 and P-LB-001), sourced docker/.env.local and gql/ids.

# wait_count <sql> <expected> <message>: polls psql up to 30 s for the query to return <expected>.
wait_count() {
  local got=""
  for _ in $(seq 1 60); do
    got=$(psql_app "$1")
    [ "$got" = "$2" ] && break
    sleep 0.5
  done
  assert_eq "$got" "$2" "$3"
}
# pub <htx> <password> <topic> <json>: publishes QoS 1 from inside the broker container as the device account.
pub() { $COMPOSE exec -T mosquitto mosquitto_pub -h localhost -u "$1" -P "$2" -q 1 -t "$3" -m "$4"; }
device_password() { printf '%s' "$DXOS_MQTT_DEVICES" | tr ',' '\n' | sed -n "s/^$1://p"; }

echo "[mqtt]"
TC_PW=$(device_password TC); LB_PW=$(device_password LB)
[ -n "$TC_PW" ] && [ -n "$LB_PW" ] || fail "DXOS_MQTT_DEVICES lacks TC or LB"
# The section owns these two fixture parcels' telemetry, so it can be re-run.
psql_app "delete from telemetry.sensor_readings where parcel_code in ('P-TC-001','P-LB-001')" >/dev/null
psql_app "delete from telemetry.ingest_rejects where topic like 'htx/%/plot/P-TC-001/%' or topic like 'htx/%/plot/P-LB-001/%'" >/dev/null
NOWTS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MSG="{\"ts\":\"$NOWTS\",\"value\":23.4}"
TOPIC_TC=htx/TC/plot/P-TC-001/soil_moisture

if $COMPOSE exec -T mosquitto mosquitto_pub -h localhost -q 1 -t "$TOPIC_TC" -m "$MSG" >/dev/null 2>&1; then fail "anonymous publish accepted"; else pass "anonymous publish refused"; fi

# A denied publish does not make mosquitto_pub fail, so the valid message after it is the positive control.
pub TC "$TC_PW" htx/LB/plot/P-LB-001/soil_moisture "$MSG" >/dev/null 2>&1 || true
pub TC "$TC_PW" "$TOPIC_TC" "$MSG" || fail "TC publish failed"
wait_count "select count(*) from telemetry.sensor_readings where htx_code='TC' and parcel_code='P-TC-001'" 1 "valid TC reading stored"
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings where htx_code='LB'")" "0" "TC publishing into the LB topic created no row"

pub TC "$TC_PW" htx/TC/plot/P-LB-001/soil_moisture "$MSG" || fail "TC publish failed"
wait_count "select count(*) from telemetry.ingest_rejects where topic='htx/TC/plot/P-LB-001/soil_moisture' and reason='unknown_parcel' and htx_code='TC'" 1 "parcel of another HTX rejected as unknown_parcel"

# The duplicate and the sentinel travel the same session in order, so the sentinel's arrival proves the duplicate was handled.
pub TC "$TC_PW" "$TOPIC_TC" "$MSG" || fail "TC publish failed"
pub TC "$TC_PW" htx/TC/plot/P-TC-001/air_temperature "$MSG" || fail "TC publish failed"
wait_count "select count(*) from telemetry.sensor_readings where parcel_code='P-TC-001' and sensor='air_temperature'" 1 "sentinel reading stored"
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings where parcel_code='P-TC-001' and sensor='soil_moisture'")" "1" "duplicate message added no row"

$COMPOSE stop dxos-ingest >/dev/null 2>&1 || fail "stop dxos-ingest"
pub TC "$TC_PW" htx/TC/plot/P-TC-001/rainfall "$MSG" || fail "TC publish failed"
$COMPOSE start dxos-ingest >/dev/null 2>&1 || fail "start dxos-ingest"
wait_count "select count(*) from telemetry.sensor_readings where parcel_code='P-TC-001' and sensor='rainfall'" 1 "message published while the worker was down is delivered after restart"

ROWS=$(psql_app "select count(*) from telemetry.sensor_readings")
$COMPOSE run --rm platform-init >/dev/null 2>&1 && pass "platform-init re-run ok (telemetry schema)" || fail "platform-init re-run failed"
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings")" "$ROWS" "platform-init re-run left sensor_readings unchanged"

echo "[telemetry permissions]"
pub LB "$LB_PW" htx/LB/plot/P-LB-001/soil_moisture "$MSG" || fail "LB publish failed"
wait_count "select count(*) from telemetry.sensor_readings where htx_code='LB'" 1 "valid LB reading stored"
TQ='{telemetry_sensor_readings(where:{parcel_code:{_in:["P-TC-001","P-LB-001"]}}){htx_code}}'  # scoped: a demo simulator may have written other parcels
TM=$(user_token smoke_manager_tc); TL=$(user_token smoke_manager_lb); TF=$(user_token smoke_farmer_tc)
[ -n "$TM" ] && [ -n "$TL" ] && [ -n "$TF" ] || fail "telemetry tokens empty"
assert_eq "$(ids "$(gql "$TM" "$TQ" manager)" '.data.telemetry_sensor_readings[].htx_code | select(. != "TC")')" "" "manager TC sees no non-TC readings"
assert_eq "$(ids "$(gql "$TM" "$TQ" manager)" '.data.telemetry_sensor_readings|length')" "3" "manager TC sees its 3 readings"
assert_eq "$(ids "$(gql "$TL" "$TQ" manager)" '.data.telemetry_sensor_readings[].htx_code')" "LB" "manager LB sees only the LB reading"
gql "$TM" '{telemetry_lifecycle_runs{id}}' manager | jq -e 'has("errors")|not' >/dev/null && pass "manager can query telemetry_lifecycle_runs" || fail "manager cannot query telemetry_lifecycle_runs"
gql "$TF" "$TQ" farmer | jq -e 'has("errors")' >/dev/null && pass "farmer gets an error on telemetry_sensor_readings" || fail "farmer can query telemetry_sensor_readings"

echo "[ingest db error]"
DBERR_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
readings_restore() { psql_app "alter table if exists telemetry.sensor_readings_held rename to sensor_readings" >/dev/null 2>&1 || true; }
trap readings_restore EXIT
psql_app "delete from telemetry.sensor_readings where parcel_code='P-TC-001' and sensor='soil_temperature'" >/dev/null
psql_app "alter table telemetry.sensor_readings rename to sensor_readings_held" >/dev/null
pub TC "$TC_PW" htx/TC/plot/P-TC-001/soil_temperature "{\"ts\":\"$DBERR_TS\",\"value\":21.5}" || fail "TC publish failed"
sleep 3  # the worker fails the insert, drops its session and keeps retrying the unacked message
readings_restore
wait_count "select count(*) from telemetry.sensor_readings where parcel_code='P-TC-001' and sensor='soil_temperature' and ts='$DBERR_TS'" 1 "message unacked during a database error is redelivered and stored once"
trap - EXIT

echo "[lifecycle]"
# Deleting the hot table is fine here: the section owns it from now on, a demo simulator only adds rows at "now".
psql_app "delete from telemetry.sensor_readings" >/dev/null
DEVICE_HTXS=$(printf '%s' "$DXOS_MQTT_DEVICES" | tr ',' '\n' | cut -d: -f1 | sed "s/.*/'&'/" | paste -sd, -)
PARCELS=$(psql_app "select count(*) from public.parcels p join public.households h on h.id=p.household_id join public.htx_profiles x on x.id=h.htx_profile_id where x.htx_code in ($DEVICE_HTXS)")
$COMPOSE run --rm -T dxos-simulator python -m dxos_dataops simulate --backfill-days 45 --step-minutes 720 >/dev/null 2>&1 || fail "backfill simulate failed"
# now-45d .. now-1d in 12-hour steps is 89 ticks of 5 sensors per parcel.
wait_count "select count(*) from telemetry.sensor_readings where ts < now() - interval '12 hours'" "$((89 * 5 * PARCELS))" "backfill rows arrived"
# Lifecycle floors its cutoff to UTC midnight, so the partly expired day stays hot as a whole.
CUTOFF=$(psql_app "select date_trunc('day', now() at time zone 'UTC' - interval '30 days')")
KEPT_SQL="select count(*) from telemetry.sensor_readings where ts >= '$CUTOFF+00' and ts < now() - interval '12 hours'"
KEPT=$(psql_app "$KEPT_SQL")
[ "$KEPT" -gt 0 ] || fail "backfill left no in-retention rows"
lifecycle_once() { $COMPOSE exec -T dxos-lifecycle python -m dxos_dataops lifecycle --once || fail "lifecycle --once failed"; }
cold_count() { $COMPOSE exec -T dxos-lifecycle python -m dxos_dataops query "select count(*) from sensor_readings_cold"; }
exported_sum() { psql_app "select coalesce(sum(row_count), 0) from telemetry.lifecycle_runs where status='done'"; }
# Baselines, because a re-used dev lake may hold a key twice (earlier late-arrival rows) and the view counts it once.
COLD0=$(cold_count); EXPORTED0=$(exported_sum)
lifecycle_once
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings where ts < '$CUTOFF+00'")" "0" "no row older than the floored cutoff remains"
assert_eq "$(psql_app "$KEPT_SQL")" "$KEPT" "rows inside retention unchanged"
assert_eq "$(( $(cold_count) - COLD0 ))" "$(( $(exported_sum) - EXPORTED0 ))" "cold query counts every exported row once"
assert_eq "$(psql_app "select count(*) from telemetry.lifecycle_runs r where status='done' and not exists (select 1 from audit.events e where e.op='lake_export' and e.source='dxos-lifecycle' and e.row_id=r.target and e.new_data->>'sha256'=r.sha256 and (e.new_data->>'rows')::bigint=r.row_count)")" "0" "every done run matches its lake_export audit event"
assert_eq "$(psql_app "select first_bad_id is null from audit.verify_chain()")" "t" "audit chain verifies"
LATE=$(psql_app "select htx_code || '|' || partition_date from telemetry.lifecycle_runs where status='done' order by partition_date limit 1")
LATE_HTX=${LATE%|*}; LATE_DATE=${LATE#*|}
LATE_FILES="select count(*) from telemetry.lifecycle_runs where status='done' and htx_code='$LATE_HTX' and partition_date='$LATE_DATE'"
FILES=$(psql_app "$LATE_FILES")
psql_app "insert into telemetry.sensor_readings (htx_code, parcel_code, sensor, ts, value) values ('$LATE_HTX', 'late-arrival', 'rainfall', '$LATE_DATE 12:34:56+00', 1.0)" >/dev/null
lifecycle_once
assert_eq "$(psql_app "$LATE_FILES")" "$((FILES + 1))" "late row exported to a second file for the same date"
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings where parcel_code='late-arrival'")" "0" "late row left the hot table"

echo "[llm]"
LLM_URL="$GATEWAY/api/ai/llm/v1/chat/completions"
LLM_MODEL=$($COMPOSE --profile tools config --format json | jq -r '.services["ollama-init"].environment.DXOS_LLM_MODEL')  # what ollama-init pulled, not the sourced .env.local
LLM_BODY="{\"model\":\"$LLM_MODEL\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello.\"}]}"
LT=$(user_token smoke_manager_tc); LTN=$(user_token smoke_manager_tc dxos-noaud)
[ -n "$LT" ] && [ -n "$LTN" ] || fail "llm tokens empty"
assert_http "401" "llm chat without a token is 401" -- -X POST -H 'Content-Type: application/json' -d "$LLM_BODY" "$LLM_URL"
assert_http "401" "llm chat with a token lacking the audience is 401" -- -X POST -H "Authorization: Bearer $LTN" -H 'Content-Type: application/json' -d "$LLM_BODY" "$LLM_URL"
assert_http "404" "llm management API (pull) is not routed" -- -X POST -H "Authorization: Bearer $LT" -H 'Content-Type: application/json' -d '{"name":"x"}' "$GATEWAY/api/ai/llm/api/pull"
assert_http "404" "llm chat route rejects GET" -- -H "Authorization: Bearer $LT" "$LLM_URL"
LLM_T0=$(date +%s)
# A previous smoke run may have used up the route's 30/60 s window, so retry on 429 for up to 65 s.
LLM_REPLY=""; LLM_CODE=""
while :; do
  LLM_CODE=$(curl -s -o "${TMPDIR:-/tmp}/dxos-llm.json" -w '%{http_code}' --max-time 120 -X POST -H "Authorization: Bearer $LT" -H 'Content-Type: application/json' -d "$LLM_BODY" "$LLM_URL") || LLM_CODE=000
  [ "$LLM_CODE" = 429 ] && [ $(( $(date +%s) - LLM_T0 )) -lt 65 ] || break
  sleep 2
done
LLM_REPLY=$(jq -r '.choices[0].message.content // empty' "${TMPDIR:-/tmp}/dxos-llm.json" 2>/dev/null) || true; rm -f "${TMPDIR:-/tmp}/dxos-llm.json"
echo "llm chat took $(( $(date +%s) - LLM_T0 ))s"
[ -n "$LLM_REPLY" ] && pass "llm chat returns content" || fail "llm chat returned no content (last HTTP status $LLM_CODE)"
# Last: this burns the route's 30/60 s budget.
LLM_429=0
for _ in $(seq 1 31); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H "Authorization: Bearer $LT" -H 'Content-Type: application/json' -d '{"model":"missing","messages":[]}' "$LLM_URL")" = 429 ] && LLM_429=1
done
assert_eq "$LLM_429" "1" "llm route rate limit returns 429"
# The budget is per bearer: another user must not be throttled by the first one's burst.
LT2=$(user_token smoke_farmer_tc); [ -n "$LT2" ] || fail "second llm token empty"
LLM_OTHER=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H "Authorization: Bearer $LT2" -H 'Content-Type: application/json' -d '{"model":"missing","messages":[]}' "$LLM_URL")
assert_eq "$LLM_OTHER" "400" "llm rate limit is per user (upstream answers the unknown model with 400)"

echo "[release guards]"
# `--version` makes kc.sh exit at once, so only the guard decides the exit code.
kc_guard() { OPENTEA_VERSION=0.0.0 $COMPOSE -f docker/docker-compose.release.yml run --rm --no-deps -e "KEYCLOAK_ADMIN_PASSWORD=$1" keycloak --version >/dev/null 2>&1; }
for weak in "" admin ADMIN change_me_x CHANGE_ME_Y; do
  kc_guard "$weak" && fail "release keycloak accepted weak admin password '$weak'" || pass "release keycloak refuses admin password '$weak'"
done
kc_guard "a-Strong-Pass-1" && pass "release keycloak starts with a strong admin password" || fail "release keycloak refused a strong admin password"

echo "[migrations]"
# The migration history must produce the schema the app uses: replaying it into a shadow database must match schema.prisma.
$COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -tAc "select 1 from pg_database where datname='prisma_shadow'" | grep -q 1 \
  || $COMPOSE exec -T postgres psql -U agrimarket -d agrimarket -c "create database prisma_shadow" >/dev/null || fail "cannot create prisma_shadow"
SHADOW_URL=$(PGU=agrimarket PGP="$POSTGRES_PASSWORD" node -e 'process.stdout.write("postgresql://"+encodeURIComponent(process.env.PGU)+":"+encodeURIComponent(process.env.PGP)+"@localhost:5432/prisma_shadow")')
DIFF_RC=0
DIFF_OUT=$(cd apps/web && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_URL" --exit-code 2>&1) || DIFF_RC=$?
[ "$DIFF_RC" = 0 ] && pass "migrations match schema.prisma (migrate diff is empty)" || fail "migrate diff exit $DIFF_RC: $DIFF_OUT"

echo "[internal gateway port]"
# The web server calls from one container IP, so port 9081 (compose network only) skips the per-IP limit.
# Requests need a valid token: openid-connect rejects anonymous ones before limit-count counts them.
INT_URL="http://apisix:9081/api/data/graphql"
IT=$(user_token smoke_manager_tc); [ -n "$IT" ] || fail "internal port token empty"
INT_NOTOKEN=$($COMPOSE exec -T hasura curl -s -o /dev/null -w '%{http_code}' -X POST "$INT_URL") || INT_NOTOKEN=000
assert_eq "$INT_NOTOKEN" "401" "internal port without a token is 401"
INT_CODES=$($COMPOSE exec -T hasura sh -c "for i in \$(seq 1 310); do curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 -X POST -H 'Authorization: Bearer $IT' $INT_URL; done") || fail "internal gateway port requests failed to run"
# Pin the whole set: 000/401 never reach limit-count, so "no 429" alone could pass vacuously.
assert_eq "$(echo "$INT_CODES" | sort | uniq -c | tr -s ' ' | tr '\n' ';')" " 310 200;" "310 authenticated requests on the internal port all reached Hasura (200) and none was rate limited"
curl -s -o /dev/null --max-time 3 http://localhost:9081/ && fail "internal gateway port 9081 is reachable from the host" || pass "internal gateway port 9081 is not published to the host"
# Last: this exhausts the per-IP window on 9080, so wait for it to clear for the next smoke run.
EXT_429=0
# Up to 650 requests: a fixed 60 s window can reset mid-loop, so 310 alone could straddle two windows.
for _ in $(seq 1 650); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $IT" "$GATEWAY/api/data/graphql")" != 429 ] || { EXT_429=1; break; }
done
assert_eq "$EXT_429" "1" "authenticated requests on the public port hit the rate limit"
INT_T0=$(date +%s)
while [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H "Authorization: Bearer $IT" "$GATEWAY/api/data/graphql" || true)" = 429 ]; do
  [ $(( $(date +%s) - INT_T0 )) -lt 65 ] || fail "public port still answers 429 after 65 s"
  sleep 2
done
pass "public port rate limit window cleared"
