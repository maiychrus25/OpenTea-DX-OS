-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- App Store: catalogue of installable mini-apps, per-HTX enablement and the install request queue. Idempotent.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.app_catalog (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  version     text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  license     text        NOT NULL,
  publisher   text        NOT NULL,
  menu        jsonb       NOT NULL,
  roles       text[]      NOT NULL,
  has_public  boolean     NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- htx_code '*' means every HTX (written by ./dxos install).
CREATE TABLE IF NOT EXISTS platform.app_enablements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     text        NOT NULL,
  htx_code   text        NOT NULL,
  enabled_by text        NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, htx_code)
);

CREATE TABLE IF NOT EXISTS platform.app_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       text        NOT NULL,
  htx_code     text        NOT NULL,
  action       text        NOT NULL CHECK (action IN ('ENABLE', 'DISABLE')),
  requested_by text        NOT NULL,
  status       text        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
-- One open request per app and HTX: a double click or a second tab cannot queue twice.
CREATE UNIQUE INDEX IF NOT EXISTS app_requests_one_open
  ON platform.app_requests (app_id, htx_code) WHERE status IN ('PENDING', 'RUNNING');

-- Single row: the worker's last poll, so the web app can tell whether anyone is processing requests.
CREATE TABLE IF NOT EXISTS platform.app_worker (
  id      boolean     PRIMARY KEY DEFAULT true CHECK (id),
  seen_at timestamptz NOT NULL
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_enablements
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_requests
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
