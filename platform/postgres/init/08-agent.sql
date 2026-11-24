-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Agentic layer (milestone M1a): runs, proposals, settings and row-level audit triggers. Idempotent.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.agent_runs (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code       text          NOT NULL,
  agent          text          NOT NULL,
  trigger        text          NOT NULL CHECK (trigger IN ('schedule', 'event', 'manual')),
  started_at     timestamptz   NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text          NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed', 'skipped')),
  provider       text,
  model          text,
  tokens_in      integer,
  tokens_out     integer,
  cost_estimate  numeric(12,4),
  error          text,
  prompt_version text,
  input_hash     text
);

CREATE TABLE IF NOT EXISTS platform.agent_proposals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code         text        NOT NULL,
  run_id           uuid        REFERENCES platform.agent_runs(id),
  agent            text        NOT NULL,
  kind             text        NOT NULL,
  payload          jsonb       NOT NULL,
  reason_vi        text        NOT NULL,
  evidence         jsonb       NOT NULL,
  confidence       real,
  risk             text        NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  status           text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'executed', 'failed', 'rejected', 'expired', 'stale')),
  origin           text        NOT NULL DEFAULT 'agent' CHECK (origin IN ('agent', 'user')),
  requested_by     text,
  dedupe_key       text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  decided_by       text,
  decided_by_name  text,
  decided_at       timestamptz,
  decision_channel text        CHECK (decision_channel IN ('web', 'telegram')),
  decision_note    text,
  edited_payload   jsonb,
  executed_at      timestamptz,
  result           jsonb
);

-- One open proposal per HTX, kind and dedupe key so retries or repeated runs never duplicate open items.
CREATE UNIQUE INDEX IF NOT EXISTS agent_proposals_one_open
  ON platform.agent_proposals (htx_code, kind, dedupe_key) WHERE status IN ('proposed', 'approved');

CREATE INDEX IF NOT EXISTS agent_proposals_htx_status
  ON platform.agent_proposals (htx_code, status, created_at DESC);

-- Entries (or other subjects) each proposal acts on; a new journal proposal is refused while an open one covers any of them.
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS subject_ids text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS agent_proposals_subject_ids
  ON platform.agent_proposals USING GIN (subject_ids);

CREATE TABLE IF NOT EXISTS platform.agent_settings (
  id             uuid          NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  htx_code       text          NOT NULL,
  agent          text          NOT NULL,
  enabled        boolean       NOT NULL DEFAULT false,
  schedule       text,
  provider       text          NOT NULL DEFAULT 'ollama',
  thresholds     jsonb         NOT NULL DEFAULT '{}',
  monthly_budget numeric(12,2),
  PRIMARY KEY (htx_code, agent)
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_runs
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_proposals
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_settings
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
