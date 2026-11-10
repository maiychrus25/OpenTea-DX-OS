#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Seeds a throwaway database twice: checks the TC and LB demo data and that another HTX's rows stay untouched.
# Run from anywhere: bash platform/tests/seed-test.sh (needs Docker, jq and apps/web/node_modules).
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh

NAME="dxos-seed-test-$$"
PW=seed-test
PORT=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
URL="postgresql://agrimarket:$PW@127.0.0.1:$PORT/agrimarket"
FARMER_TC_ID=$(jq -r '.users[] | select(.username == "farmer_tc") | .id // empty' docker/keycloak/realm-agrimarket.json)

docker run -d --rm --name "$NAME" -p "127.0.0.1:$PORT:5432" -e POSTGRES_USER=agrimarket -e POSTGRES_PASSWORD=$PW \
  -e POSTGRES_DB=agrimarket -v "$PWD/platform/postgres/init:/init:ro" opentea-dx-os/postgres:local >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT
sql() { docker exec -i -e PGPASSWORD=$PW "$NAME" psql -h 127.0.0.1 -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -tAq "$@"; }
# Over TCP: the entrypoint's first server listens only on the socket and restarts after initdb.
for _ in $(seq 1 60); do sql -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
init() { docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c client_min_messages=warning' "$NAME" sh -c 'for f in /init/*.sql; do psql -h 127.0.0.1 -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q -f "$f" || exit 1; done' >/dev/null; }

echo "[seed: migrate]"
init  # as make platform-up: init scripts, migrate, init scripts again
(cd apps/web && DATABASE_URL="$URL" npx prisma migrate deploy >/dev/null)
init
pass "throwaway database migrated on port $PORT"

# Another HTX, and a household with no HTX: an older seed moved such rows into its own HTX.
sql <<'SQL'
insert into htx_profiles (id, name, address, crop_types, htx_code, updated_at) values ('htx_other', 'HTX Other', 'Elsewhere', '{"Chè"}', 'OT', now());
insert into households (id, name, phone, htx_profile_id, updated_at) values
  ('hh_other_1', 'Household OT 1', '0900999001', 'htx_other', now()),
  ('hh_orphan_1', 'Household Orphan 1', '0900999002', null, now());
insert into parcels (id, parcel_code, household_id, crop_type, area_ha, status, updated_at) values ('pc_other_1', 'P-OT-001', 'hh_other_1', 'Chè Trung du', 0.5, 'TENDING', now());
insert into lots (id, lot_code, commodity, harvest_date, htx_profile_id, updated_at) values ('lot_other_1', 'OT-LOT-001', 'Chè', now(), 'htx_other', now());
insert into lot_parcels (id, lot_id, parcel_id) values ('lp_other_1', 'lot_other_1', 'pc_other_1');
SQL
OTHER_SQL="select md5(string_agg(r, '|' order by r)) from (
  select to_jsonb(t)::text r from htx_profiles t where id = 'htx_other'
  union all select to_jsonb(t)::text from households t where id in ('hh_other_1', 'hh_orphan_1')
  union all select to_jsonb(t)::text from parcels t where id = 'pc_other_1'
  union all select to_jsonb(t)::text from lots t where id = 'lot_other_1'
  union all select to_jsonb(t)::text from lot_parcels t where id = 'lp_other_1'
  union all select to_jsonb(t)::text from weather_cache t where parcel_id = 'pc_other_1') s"
OTHER_BEFORE=$(sql -c "$OTHER_SQL")

echo "[seed: run twice]"
(cd apps/web && DATABASE_URL="$URL" npm run --silent seed) || fail "first seed run failed"
pass "first seed run"
LOT1=$(sql -c "select string_agg(lot_code, ',') from lots where htx_profile_id = 'htx_tc'")
(cd apps/web && DATABASE_URL="$URL" npm run --silent seed) || fail "second seed run failed"
pass "second seed run"

echo "[seed: counts]"
counts() { # <htx_code>: households,parcels,cycles,journal entries,lots,disease reports
  sql -c "select (select count(*) from households h where h.htx_profile_id = p.id) || ',' ||
    (select count(*) from parcels x join households h on h.id = x.household_id where h.htx_profile_id = p.id) || ',' ||
    (select count(*) from parcel_crop_cycles c join parcels x on x.id = c.parcel_id join households h on h.id = x.household_id where h.htx_profile_id = p.id) || ',' ||
    (select count(*) from journal_entries j join parcels x on x.id = j.parcel_id join households h on h.id = x.household_id where h.htx_profile_id = p.id) || ',' ||
    (select count(*) from lots l where l.htx_profile_id = p.id) || ',' ||
    (select count(*) from disease_reports d join households h on h.id = d.household_id where h.htx_profile_id = p.id)
    from htx_profiles p where p.htx_code = '$1'"
}
assert_eq "$(counts TC)" "3,5,6,5,1,1" "TC: 3 households, 5 parcels, 6 rounds, 5 journal entries, 1 lot, 1 disease report"
assert_eq "$(counts LB)" "2,3,3,0,0,0" "LB: 2 households, 3 parcels, 3 rounds"
assert_eq "$(sql -c "select count(*) from htx_profiles where htx_code = 'MD2'")" "0" "no MD2 rice cooperative"
assert_eq "$(sql -c "select count(*) from parcels x join households h on h.id = x.household_id join htx_profiles p on p.id = h.htx_profile_id
  where p.htx_code in ('TC', 'LB') and (x.crop_type not in ('Chè Trung du', 'Chè LDP1', 'Chè Kim Tuyên') or x.centroid_lat is null)")" "0" \
  "every TC and LB parcel grows a tea variety and has a centroid"
assert_eq "$(sql -c "select count(*) from parcels x join households h on h.id = x.household_id join htx_profiles p on p.id = h.htx_profile_id
  where (p.htx_code = 'TC' and not (x.centroid_lat between 21.50 and 21.62 and x.centroid_lng between 105.70 and 105.83))
     or (p.htx_code = 'LB' and not (x.centroid_lat between 21.65 and 21.77 and x.centroid_lng between 105.56 and 105.68))")" "0" \
  "coordinates fall inside the Tan Cuong and La Bang tea areas"
assert_eq "$(sql -c "select count(*) from parcel_crop_cycles c join parcels x on x.id = c.parcel_id where (x.parcel_code like 'TC-%' or x.parcel_code like 'LB-%')
  and c.season !~ '^Lứa [0-9]+/[0-9]{4}$'")" "0" "every round is labelled 'Lứa <n>/<year>'"

echo "[seed: parcel A3 of TC]"
a3() { sql -c "select $1 from parcels x where x.parcel_code = 'TC-A3'"; }
assert_eq "$(a3 status)" "TENDING" "A3 is in its current round"
assert_eq "$(a3 "(select count(*) from parcel_crop_cycles c where c.parcel_id = x.id and c.harvested_at < now()) || ',' ||
  (select count(*) from parcel_crop_cycles c where c.parcel_id = x.id and c.harvested_at is null)")" "1,1" "A3 has a harvested previous round and an open current round"
assert_eq "$(a3 "(select count(*) from journal_entries j where j.parcel_id = x.id and j.activity_type = 'FERTILIZING' and j.status = 'APPROVED'
  and j.entry_date > (select max(harvested_at) from parcel_crop_cycles c where c.parcel_id = x.id))")" "1" "A3 has a fertiliser entry in the current round"
assert_eq "$(a3 "(select count(*) from journal_entries j join journal_activities a on a.journal_entry_id = j.id
  where j.parcel_id = x.id and j.activity_type = 'SPRAYING' and j.status = 'APPROVED' and a.withdrawal_days = 7
  and a.safe_harvest_date > now() and a.safe_harvest_date <= now() + interval '7 days')")" "1" "A3 has a spraying entry whose 7-day withdrawal is still active"
assert_eq "$(a3 "(select l.status || ',' || (l.public_page_data->>'lot_code' = l.lot_code) || ',' || (l.public_page_data->>'is_harvest_safe') || ',' || (l.qr_image_url like 'data:image/png;base64,%')
  || ',' || (l.harvest_date >= (select max(harvested_at) from parcel_crop_cycles c where c.parcel_id = x.id) - interval '1 day')
  from lots l join lot_parcels lp on lp.lot_id = l.id where lp.parcel_id = x.id)")" "QR_EXPORTED,true,true,true,true" \
  "the previous round's lot is exported with a public trace snapshot and a QR image"
assert_eq "$(a3 "(select count(*) from disease_reports d where d.parcel_id = x.id and d.status = 'PENDING' and d.household_id = x.household_id)")" "1" \
  "A3 has one pending disease report"
[ -n "$FARMER_TC_ID" ] || fail "farmer_tc has no fixed id in the realm"
assert_eq "$(a3 "(select h.keycloak_user_id from households h where h.id = x.household_id)")" "$FARMER_TC_ID" "A3's household belongs to the demo farmer_tc"
assert_eq "$(sql -c "select string_agg(lot_code, ',') from lots where htx_profile_id = 'htx_tc'")" "$LOT1" "the lot keeps its public code across seed runs"

echo "[seed: other cooperatives]"
assert_eq "$(sql -c "$OTHER_SQL")" "$OTHER_BEFORE" "rows of another HTX and of a household without HTX are untouched"
assert_eq "$(sql -c "select count(*) from weather_cache w join parcels x on x.id = w.parcel_id where x.parcel_code = 'P-OT-001'")" "0" "no weather rows added for another HTX's parcel"
