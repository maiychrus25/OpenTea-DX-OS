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
