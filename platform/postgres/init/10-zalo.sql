-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Platform Zalo OA/ZNS channel (phase 4, C1): outbox, templates, per-cooperative settings, consents and OA credentials. Idempotent.
-- No foreign keys to the public tables: this file runs before the Prisma migrations on a new database.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.zalo_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code        text        NOT NULL,
  event_kind      text        NOT NULL CHECK (event_kind IN ('PRICE_PUBLISHED', 'TICKET_RECEIPT', 'WITHDRAWAL_ENDED', 'SETTLEMENT_CLOSED')),
  event_id        text        NOT NULL,
  household_id    text        NOT NULL,
  phone           text        NOT NULL,
  template_key    text        NOT NULL CHECK (template_key IN ('price_today', 'ticket_receipt', 'withdrawal_ended', 'settlement_closed')),
  params          jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'sent', 'failed', 'skipped')),
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until     timestamptz,
  zalo_msg_id     text,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  -- One message per event and phone, however many times the event is raised.
  UNIQUE (event_kind, event_id, phone)
);
CREATE INDEX IF NOT EXISTS zalo_outbox_due ON platform.zalo_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS zalo_outbox_htx_created ON platform.zalo_outbox (htx_code, created_at DESC);

-- Filled by platform_admin once Zalo approves a template. Only these four keys exist.
CREATE TABLE IF NOT EXISTS platform.zalo_templates (
  template_key    text        PRIMARY KEY CHECK (template_key IN ('price_today', 'ticket_receipt', 'withdrawal_ended', 'settlement_closed')),
  zns_template_id text        NOT NULL,
  params          text[]      NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.zalo_settings (
  htx_code          text        PRIMARY KEY,
  enabled           boolean     NOT NULL DEFAULT false,
  kinds             text[]      NOT NULL DEFAULT '{PRICE_PUBLISHED,TICKET_RECEIPT,WITHDRAWAL_ENDED,SETTLEMENT_CLOSED}',
  quiet_start_hour  smallint    NOT NULL DEFAULT 21 CHECK (quiet_start_hour BETWEEN 0 AND 23),
  quiet_end_hour    smallint    NOT NULL DEFAULT 6 CHECK (quiet_end_hour BETWEEN 1 AND 23),
  monthly_quota     integer     NOT NULL DEFAULT 2000 CHECK (monthly_quota >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Append-only: the current state of a household is its newest row (clock_timestamp keeps rows of one transaction in order).
CREATE TABLE IF NOT EXISTS platform.zalo_consents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id text        NOT NULL,
  htx_code     text        NOT NULL,
  phone        text        NOT NULL,
  status       text        NOT NULL CHECK (status IN ('OPTED_IN', 'OPTED_OUT')),
  source       text        NOT NULL CHECK (source IN ('REGISTRATION', 'OFFICER', 'MEMBER')),
  recorded_by  text        NOT NULL,
  at           timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS zalo_consents_household ON platform.zalo_consents (household_id, at DESC);

CREATE OR REPLACE FUNCTION platform.zalo_consents_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'zalo_consents is append-only';
END $$;
CREATE OR REPLACE TRIGGER zalo_consents_append_only BEFORE UPDATE OR DELETE ON platform.zalo_consents
  FOR EACH ROW EXECUTE FUNCTION platform.zalo_consents_append_only();

-- The OA tokens, one row, encrypted by the web (AES-256-GCM, key from DXOS_ZALO_TOKEN_KEY). Never audited: the row holds secrets.
CREATE TABLE IF NOT EXISTS platform.zalo_credentials (
  id                smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token_enc  text        NOT NULL,
  refresh_token_enc text        NOT NULL,
  expires_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Row audit only on the consents, the one table that records a person's decision and has an id (audit.capture_row reads NEW.id).
-- The outbox churns on every lease, settings and templates are keyed by name, and the credentials are secret.
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.zalo_consents
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.zalo_outbox;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.zalo_credentials;
