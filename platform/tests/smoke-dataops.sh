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
TM=$(user_token manager_tc); TL=$(user_token manager_lb); TF=$(user_token farmer_tc)
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
KEPT_SQL="select count(*) from telemetry.sensor_readings where ts >= now() - interval '30 days' and ts < now() - interval '12 hours'"
KEPT=$(psql_app "$KEPT_SQL")
[ "$KEPT" -gt 0 ] || fail "backfill left no in-retention rows"
lifecycle_once() { $COMPOSE exec -T dxos-lifecycle python -m dxos_dataops lifecycle --once || fail "lifecycle --once failed"; }
lifecycle_once
assert_eq "$(psql_app "select count(*) from telemetry.sensor_readings where ts < now() - interval '30 days'")" "0" "no row older than 30 days remains"
assert_eq "$(psql_app "$KEPT_SQL")" "$KEPT" "rows inside retention unchanged"
assert_eq "$($COMPOSE exec -T dxos-lifecycle python -m dxos_dataops query "select count(*) from sensor_readings_cold")" \
  "$(psql_app "select sum(row_count) from telemetry.lifecycle_runs where status='done'")" "cold query counts every exported row"
assert_eq "$(psql_app "select count(*) from telemetry.lifecycle_runs r where status='done' and not exists (select 1 from audit.events e where e.op='lake_export' and e.source='dxos-lifecycle' and e.row_id=r.target and e.new_data->>'sha256'=r.sha256 and (e.new_data->>'rows')::bigint=r.row_count)")" "0" "every done run matches its lake_export audit event"
assert_eq "$(psql_app "select first_bad_id from audit.verify_chain()")" "" "audit chain verifies"
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
LLM_MODEL=${DXOS_LLM_MODEL:-qwen2.5:0.5b}
LLM_BODY="{\"model\":\"$LLM_MODEL\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello.\"}]}"
LT=$(user_token manager_tc); LTN=$(user_token manager_tc dxos-noaud)
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
