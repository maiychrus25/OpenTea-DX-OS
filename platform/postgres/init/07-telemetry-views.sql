-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Daily summary of sensor readings for dashboards. Read-only; stores nothing. The day is the Vietnam
-- calendar day. Runs with the owner's rights; Hasura filters by htx_code like the raw table. Idempotent.
CREATE OR REPLACE VIEW telemetry.sensor_daily AS
SELECT
  htx_code,
  parcel_code,
  sensor,
  (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
  count(*)                                    AS reading_count,
  min(value)                                  AS min_value,
  max(value)                                  AS max_value,
  avg(value)                                  AS avg_value,
  min(ts)                                     AS first_ts,
  max(ts)                                     AS last_ts
FROM telemetry.sensor_readings
GROUP BY htx_code, parcel_code, sensor, (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
