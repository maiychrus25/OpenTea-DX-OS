-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Sensor readings for the htx-dashboard checks on a stack seeded with `npm run seed` (parcels TC-A1, TC-B1, TC-B2 of the
-- cooperative TC and LB-A1 of LB). Run by platform/tests/smoke-apps.sh and by the CI browser steps, always on a throwaway stack:
--   docker compose -f docker/docker-compose.yml exec -T postgres psql -U agrimarket -d agrimarket -v ON_ERROR_STOP=1 -q \
--     < platform/tests/fixtures/htx-dashboard-readings.sql
-- Re-runnable: it first removes every reading of these four parcels. All times are relative to now, so the readings stay inside
-- the 30-day hot retention: every 6 hours over 10 days for 3 parcels x 5 sensors, newest 30 minutes old; the one exception is
-- the rainfall sensor of TC-B2, whose newest reading is 24 hours old (silent). The newest soil moisture of TC-A1 is 47.3.
delete from telemetry.sensor_readings where parcel_code in ('TC-A1', 'TC-B1', 'TC-B2', 'LB-A1');

insert into telemetry.sensor_readings (htx_code, parcel_code, sensor, ts, value)
select 'TC', p.code, s.name,
       date_trunc('minute', now()) - interval '30 minutes' - make_interval(hours => h),
       round((s.mid + ((h / 6) % 7) * 0.9 + p.shift)::numeric, 1)::double precision
from (values ('TC-A1', 0), ('TC-B1', 2), ('TC-B2', 4)) as p(code, shift)
cross join (values ('soil_moisture', 30), ('soil_temperature', 22), ('air_temperature', 25), ('air_humidity', 70), ('rainfall', 2)) as s(name, mid)
cross join generate_series(0, 239, 6) as h
where not (p.code = 'TC-B2' and s.name = 'rainfall' and h < 24);

update telemetry.sensor_readings set value = 47.3
where htx_code = 'TC' and parcel_code = 'TC-A1' and sensor = 'soil_moisture'
  and ts = (select max(ts) from telemetry.sensor_readings where htx_code = 'TC' and parcel_code = 'TC-A1' and sensor = 'soil_moisture');

insert into telemetry.sensor_readings (htx_code, parcel_code, sensor, ts, value)
values ('LB', 'LB-A1', 'soil_moisture', date_trunc('minute', now()) - interval '30 minutes', 11.1);
