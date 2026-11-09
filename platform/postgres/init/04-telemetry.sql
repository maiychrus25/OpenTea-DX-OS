-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Sensor telemetry. No FK to public.parcels on purpose: readings must outlive a deleted parcel
-- and stay out of the Prisma migrations. Idempotent.
CREATE SCHEMA IF NOT EXISTS telemetry AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS telemetry.sensor_readings (
  htx_code    text             NOT NULL,
  parcel_code text             NOT NULL,
  sensor      text             NOT NULL,
  ts          timestamptz      NOT NULL,
  value       double precision NOT NULL,
  ingested_at timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (htx_code, parcel_code, sensor, ts)
);
CREATE INDEX IF NOT EXISTS sensor_readings_ts_idx ON telemetry.sensor_readings (ts);

CREATE TABLE IF NOT EXISTS telemetry.ingest_rejects (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  topic       text        NOT NULL,
  payload     bytea       NOT NULL,  -- truncated to 256 bytes by the worker
  reason      text        NOT NULL,
  htx_code    text
);
CREATE INDEX IF NOT EXISTS ingest_rejects_received_at_idx ON telemetry.ingest_rejects (received_at);

CREATE TABLE IF NOT EXISTS telemetry.lifecycle_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text        NOT NULL DEFAULT 'telemetry.sensor_readings',
  target         text        NOT NULL,
  htx_code       text        NOT NULL,
  partition_date date        NOT NULL,
  status         text        NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  row_count      bigint,
  min_ts         timestamptz,
  max_ts         timestamptz,
  sha256         text,
  size_bytes     bigint,
  quality        jsonb,
  error          text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
