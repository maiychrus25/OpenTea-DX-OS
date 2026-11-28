#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Zalo relay smoke test against the ZNS stub: the four messages (price, receipt, withdrawal ended, settlement), no repeat for
# the same prices, a revoked consent, and a permanent error. Sourced by smoke-platform.sh after smoke-telegram.sh and by
# smoke-agentic.sh; it needs the web, like the Telegram smoke.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-zalo.sh runs only from platform/tests/smoke-platform.sh or smoke-agentic.sh" >&2
  exit 2
fi

echo "[zalo]"
# The relay talks to the web through APISIX, so without the web there is nothing to check (CI runs this after make web-up).
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: zalo smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi
source platform/tests/lib-zalo.sh

ZL_DAY="$(TZ=Asia/Ho_Chi_Minh date +%F)"  # the app counts days in Vietnam time; from 17:00 UTC the UTC date is a day behind
# Settlement periods are contiguous and end today at the latest, so the same database cannot close a second one the same day,
# and the ledger it writes is append-only. The first run covers the four messages; a re-run (apps-smoke runs
# platform-smoke again on the same stack) stops here.
if [ "$(psql_app "select count(*) from settlement_periods s join htx_profiles h on h.id = s.htx_profile_id where h.htx_code = 'TC' and s.date_to >= '$ZL_DAY'")" != "0" ]; then
  echo "SKIP: zalo smoke already closed today's TC settlement on this database (re-run)"
  return 0
fi
ZL_TEMPLATE_IDS="price_today:900101 ticket_receipt:900102 withdrawal_ended:900103 settlement_closed:900104"
zl_cleanup() {
  psql_app "delete from platform.zalo_outbox where htx_code = 'TC'" >/dev/null 2>&1 || true
  psql_app "delete from platform.zalo_settings where htx_code = 'TC'" >/dev/null 2>&1 || true
  psql_app "delete from platform.zalo_templates" >/dev/null 2>&1 || true
  psql_app "delete from platform.zalo_credentials" >/dev/null 2>&1 || true
  psql_app "delete from journal_entries where id = 'je_smoke_zalo_tc'" >/dev/null 2>&1 || true
  zalo_relay_down >/dev/null 2>&1 || true
}
trap zl_cleanup EXIT
zl_cleanup  # a clean slate, then the relay comes up again below

ensure_user smoke_platform_admin platform_admin
# A household and parcel of its own: the fixture reload deletes hh_tc_1 and pc_tc_1, which the tickets and ledger rows written
# here would otherwise pin.
psql_app "insert into households (id, name, phone, htx_profile_id, updated_at) values
  ('hh_zalo_smoke', 'Household Zalo Smoke', '0900000099', (select id from htx_profiles where htx_code = 'TC'), now()) on conflict (id) do nothing" >/dev/null
psql_app "insert into parcels (id, parcel_code, household_id, crop_type, area_ha, status, updated_at) values
  ('pc_zalo_smoke', 'P-TC-ZALO', 'hh_zalo_smoke', 'Chè Trung du', 0.5, 'TENDING', now()) on conflict (id) do update set status = 'TENDING'" >/dev/null  # a DRAFT parcel cannot be weighed
zalo_relay_up

# 1. The platform admin enters the OA tokens and the approved template ids; the manager turns the cooperative on; one household consents.
assert_eq "$(zalo_web_status smoke_platform_admin platform_admin - PUT /api/platform/zalo/credentials '{"access_token":"smoke-access","refresh_token":"smoke-refresh","expires_at":"'"$(date -u -v+2H +%FT%TZ 2>/dev/null || date -u -d '+2 hours' +%FT%TZ)"'"}')" "200" \
  "platform admin saves the OA tokens"
for pair in $ZL_TEMPLATE_IDS; do
  psql_app "insert into platform.zalo_templates (template_key, zns_template_id, params) values ('${pair%%:*}', '${pair##*:}', '{}')
    on conflict (template_key) do update set zns_template_id = excluded.zns_template_id" >/dev/null
done
psql_app "insert into platform.zalo_settings (htx_code, enabled, quiet_start_hour, quiet_end_hour) values ('TC', true, 0, 1)
  on conflict (htx_code) do update set enabled = true, quiet_start_hour = 0, quiet_end_hour = 1" >/dev/null  # no quiet hours, so the smoke does not wait for 06:00
psql_app "insert into platform.zalo_consents (household_id, htx_code, phone, status, source, recorded_by)
  values ('hh_zalo_smoke', 'TC', '$ZL_PHONE', 'OPTED_IN', 'OFFICER', 'smoke')" >/dev/null
zalo_stub_reset

# 2. Publish a price, weigh a ticket, close a period, and let the tick find a parcel whose withdrawal ends today.
GRADE="$(zalo_web_body smoke_manager_tc manager TC GET /api/leaf-grades | jq -r '.data[0].id')"
[ -n "$GRADE" ] && [ "$GRADE" != "null" ] || fail "no leaf grade for TC"
PRICES="{\"prices\":[{\"grade_id\":\"$GRADE\",\"price_vnd_per_kg\":$((100000 + RANDOM))}]}"
assert_eq "$(zalo_web_status smoke_manager_tc manager TC PUT /api/leaf-prices/today "$PRICES")" "200" "manager publishes today's price"
assert_eq "$(zalo_web_status smoke_manager_tc manager TC POST /api/leaf-tickets "{\"household_id\":\"hh_zalo_smoke\",\"parcel_id\":\"pc_zalo_smoke\",\"grade_id\":\"$GRADE\",\"gross_kg\":20,\"deduction_pct\":2}")" "201" "a weighing ticket is saved"
PERIOD="$(zalo_web_body smoke_manager_tc manager TC POST /api/settlements "{\"date_from\":\"$ZL_DAY\",\"date_to\":\"$ZL_DAY\"}" | jq -r '.data.id')"
DETAIL="$(zalo_web_body smoke_manager_tc manager TC GET "/api/settlements/$PERIOD")"
CLOSE="$(printf '%s' "$DETAIL" | jq -c '{expected_household_count: .data.totals.households, expected_payable_total_vnd: .data.totals.payable_vnd}')"
assert_eq "$(zalo_web_status smoke_manager_tc manager TC POST "/api/settlements/$PERIOD/close" "$CLOSE")" "200" "the settlement period is closed"
psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at)
  values ('je_smoke_zalo_tc', 'pc_zalo_smoke', now() - interval '7 days', 'SPRAYING', 'Smoke Zalo', 'FARMER', 'APPROVED', 'smoke zalo', now())
  on conflict (id) do update set updated_at = now()" >/dev/null
psql_app "insert into journal_activities (id, journal_entry_id, activity_detail, withdrawal_days, safe_harvest_date)
  values ('ja_smoke_zalo_tc', 'je_smoke_zalo_tc', 'Smoke Zalo', 7, now())
  on conflict (id) do update set safe_harvest_date = now()" >/dev/null
ZL_TOKEN="$(zalo_client_token)"
[ -n "$ZL_TOKEN" ] || fail "dxos-zalo client token empty"
$COMPOSE exec -T web node -e 'fetch("http://apisix:9081/api/internal/zalo/tick", { method: "POST", headers: { Authorization: "Bearer " + process.argv[1] } }).then((r) => process.exit(r.ok ? 0 : 1))' "$ZL_TOKEN" \
  && pass "dxos-zalo token calls the internal tick" || fail "internal tick refused for the dxos-zalo token"

# 3. Four stub calls with the right template ids and the household's phone.
zalo_wait_calls "sorted(x['body']['template_id'] for x in c if x['path'] == '/message/template') == ['900101', '900102', '900103', '900104']" 45 \
  && pass "four messages reached the ZNS stub with the four template ids" || fail "the stub did not get exactly the four template ids within 90 s"
zalo_wait_calls "all(x['body']['phone'] == '$ZL_PHONE' and x['body']['tracking_id'] and x['access_token'] == 'smoke-access' for x in c if x['path'] == '/message/template')" 1 \
  && pass "every call has the household's phone, a tracking id and the OA token" || fail "a stub call lacks the phone, tracking id or token"
assert_eq "$(psql_app "select count(*) from platform.zalo_outbox where htx_code = 'TC' and status = 'sent'")" "4" "four outbox rows are sent"

# 4. Publishing the same prices again adds no call.
BEFORE="$(zalo_sent_count)"
zalo_web_status smoke_manager_tc manager TC PUT /api/leaf-prices/today "$PRICES" >/dev/null
sleep 8
assert_eq "$(zalo_sent_count)" "$BEFORE" "re-publishing the same prices sends nothing more"

# 5. After consent is revoked the next event is skipped.
psql_app "insert into platform.zalo_consents (household_id, htx_code, phone, status, source, recorded_by)
  values ('hh_zalo_smoke', 'TC', '$ZL_PHONE', 'OPTED_OUT', 'MEMBER', 'smoke')" >/dev/null
zalo_web_status smoke_manager_tc manager TC PUT /api/leaf-prices/today "{\"prices\":[{\"grade_id\":\"$GRADE\",\"price_vnd_per_kg\":$((200000 + RANDOM))}]}" >/dev/null
sleep 8
assert_eq "$(zalo_sent_count)" "$BEFORE" "no message goes to a household that opted out"
# Other TC households never consented, so each price also leaves NO_CONSENT rows for them; count only this household's.
assert_eq "$(psql_app "select count(*) from platform.zalo_outbox where household_id = 'hh_zalo_smoke' and status = 'skipped' and last_error = 'CONSENT_REVOKED'")" "1" "the event after the opt-out is skipped"

# 6. A permanent error is sent once and the row is failed.
psql_app "insert into platform.zalo_consents (household_id, htx_code, phone, status, source, recorded_by)
  values ('hh_zalo_smoke', 'TC', '$ZL_PHONE', 'OPTED_IN', 'OFFICER', 'smoke')" >/dev/null
zalo_fail_next -108 1
zalo_web_status smoke_manager_tc manager TC PUT /api/leaf-prices/today "{\"prices\":[{\"grade_id\":\"$GRADE\",\"price_vnd_per_kg\":$((300000 + RANDOM))}]}" >/dev/null
for _ in $(seq 1 30); do
  [ "$(psql_app "select count(*) from platform.zalo_outbox where htx_code = 'TC' and status = 'failed'")" = "1" ] && break
  sleep 2
done
assert_eq "$(psql_app "select count(*) from platform.zalo_outbox where htx_code = 'TC' and status = 'failed'")" "1" "a permanent error leaves the row failed"
assert_eq "$(( $(zalo_sent_count) - BEFORE ))" "1" "the permanent error was sent to Zalo exactly once"

# Public port 9080 refuses the relay's routes.
assert_http 404 "public port 9080 refuses /api/internal/zalo/outbox" -- "$GATEWAY/api/internal/zalo/outbox"

zl_cleanup; trap - EXIT
pass "zalo smoke cleaned up (credentials disabled, stub stopped)"
