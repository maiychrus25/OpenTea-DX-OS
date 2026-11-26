-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Agentic layer (milestone M1a): runs, proposals, settings and row-level audit triggers. Idempotent.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.agent_runs (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code       text          NOT NULL,
  agent          text          NOT NULL,
  trigger        text          NOT NULL CHECK (trigger IN ('schedule', 'event', 'manual', 'message')),
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
-- M5: a chat request runs A7 with trigger 'message'. Re-create the named check on databases made before M5.
ALTER TABLE platform.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_trigger_check;
ALTER TABLE platform.agent_runs ADD CONSTRAINT agent_runs_trigger_check
  CHECK (trigger IN ('schedule', 'event', 'manual', 'message'));


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
  status           text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'executed', 'failed', 'rejected', 'expired', 'stale', 'sent_to_staff_app')),
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

-- Model chosen by the manager for an external provider (M3); null means the provider's default.
ALTER TABLE platform.agent_settings ADD COLUMN IF NOT EXISTS model text;

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_runs
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_proposals
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_settings
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

-- Daily campaign (M7): one campaign per cooperative and Vietnam day, its items in order, and the 18:00 outcomes.
CREATE TABLE IF NOT EXISTS platform.campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code        text        NOT NULL,
  day             date        NOT NULL,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partial', 'done', 'dropped')),
  goals           jsonb       NOT NULL DEFAULT '[]',
  summary_vi      text        NOT NULL,
  run_id          uuid        NULL REFERENCES platform.agent_runs(id),
  decided_by      text        NULL,
  decided_by_name text        NULL,
  decided_at      timestamptz NULL,
  telegram_sent   boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, day)
);
CREATE TABLE IF NOT EXISTS platform.campaign_items (
  id          uuid    NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  campaign_id uuid    NOT NULL REFERENCES platform.campaigns(id) ON DELETE CASCADE,
  proposal_id uuid    NOT NULL REFERENCES platform.agent_proposals(id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position BETWEEN 1 AND 15),
  goal_key    text    NOT NULL,
  target      integer NOT NULL CHECK (target >= 0),
  PRIMARY KEY (campaign_id, proposal_id),
  UNIQUE (campaign_id, position)
);
CREATE TABLE IF NOT EXISTS platform.campaign_outcomes (
  id          uuid    NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  campaign_id uuid        NOT NULL REFERENCES platform.campaigns(id) ON DELETE CASCADE,
  goal_key    text        NOT NULL,
  target      integer     NOT NULL,
  actual      integer     NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, goal_key)
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.campaigns
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.campaign_items
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.campaign_outcomes
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

-- Weekly improvements (M8): A10's proposals for the cooperative's agents and campaigns, their status and their effect.
CREATE TABLE IF NOT EXISTS platform.improvements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code      text        NOT NULL,
  week          date        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('setting', 'process', 'template')),
  metric_key    text        NOT NULL,
  title_vi      text        NOT NULL CHECK (char_length(title_vi) <= 120),
  rationale_vi  text        NOT NULL CHECK (char_length(rationale_vi) <= 600),
  baseline      numeric     NOT NULL,
  evidence      jsonb       NOT NULL,
  proposal_id   uuid        NULL UNIQUE REFERENCES platform.agent_proposals(id),
  status        text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'adopted', 'declined', 'measured')),
  decided_by    text        NULL,
  adopted_at    timestamptz NULL,
  effect        jsonb       NOT NULL DEFAULT '{}',
  template      jsonb       NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, week, metric_key)
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.improvements
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

-- Staff tasks (M10): the staff app's roster and attendance, and the staff app's task id on a proposal.
-- A staff.task.create proposal waits in status 'sent_to_staff_app' until the staff app acknowledges it.
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS external_ref text NULL;
ALTER TABLE platform.agent_proposals DROP CONSTRAINT IF EXISTS agent_proposals_status_check;
ALTER TABLE platform.agent_proposals ADD CONSTRAINT agent_proposals_status_check
  CHECK (status IN ('proposed', 'approved', 'executed', 'failed', 'rejected', 'expired', 'stale', 'sent_to_staff_app'));

CREATE TABLE IF NOT EXISTS platform.staff_roster (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code   text        NOT NULL,
  staff_ref  text        NOT NULL,
  name       text        NOT NULL,
  department text        NULL,
  active     boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, staff_ref)
);

CREATE TABLE IF NOT EXISTS platform.staff_attendance (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code    text        NOT NULL,
  day         date        NOT NULL,
  present     integer     NOT NULL CHECK (present >= 0),
  reported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, day)
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.staff_roster
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
