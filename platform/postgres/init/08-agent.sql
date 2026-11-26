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
  decision_channel text        CHECK (decision_channel IN ('web', 'telegram', 'autopilot')),
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

-- Autonomous mode (M12): one row per cooperative, and the shadow, window and block columns of a proposal.
CREATE TABLE IF NOT EXISTS platform.autopilot (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code                 text        NOT NULL UNIQUE,
  enabled                  boolean     NOT NULL DEFAULT false,
  enabled_by               text        NULL,
  enabled_by_name          text        NULL,
  enabled_at               timestamptz NULL,
  unlocked_kinds           text[]      NOT NULL DEFAULT '{}',
  daily_cap                integer     NOT NULL DEFAULT 50 CHECK (daily_cap BETWEEN 1 AND 50),
  stopped_at               timestamptz NULL,
  stopped_by               text        NULL,
  stop_reason              text        NULL CHECK (stop_reason IN ('manual', 'enabler_lost', 'inactive', 'brake_failures', 'brake_cap', 'brake_blocks', 'brake_volume')),
  last_manager_activity_at timestamptz NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS shadow_auto boolean NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS run_at timestamptz NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS run_claimed_at timestamptz NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS blocked_by text NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS blocked_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS agent_proposals_due
  ON platform.agent_proposals (run_at) WHERE run_at IS NOT NULL AND run_claimed_at IS NULL AND status = 'proposed';
-- Re-create the named check on databases made before M12 (the value 'autopilot').
ALTER TABLE platform.agent_proposals DROP CONSTRAINT IF EXISTS agent_proposals_decision_channel_check;
ALTER TABLE platform.agent_proposals ADD CONSTRAINT agent_proposals_decision_channel_check
  CHECK (decision_channel IN ('web', 'telegram', 'autopilot'));

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.autopilot
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

-- Mini-app factory (M13): a manager's request for an app, its builds, and the files a build keeps. One open request per cooperative.
CREATE TABLE IF NOT EXISTS platform.app_build_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code          text        NOT NULL,
  requested_by      text        NOT NULL,
  requested_by_name text        NULL,
  request_text      text        NOT NULL CHECK (char_length(request_text) BETWEEN 5 AND 500),
  questions         jsonb       NOT NULL DEFAULT '[]',
  answer_text       text        NULL CHECK (char_length(answer_text) <= 1000),
  path              text        NULL CHECK (path IN ('store', 'book', 'build')),
  app_id            text        NULL,
  spec              jsonb       NULL,
  status            text        NOT NULL DEFAULT 'new' CHECK (status IN
    ('new', 'asking', 'routed', 'spec_proposed', 'spec_approved', 'building', 'passed', 'failed', 'installed', 'cancelled')),
  error_vi          text        NULL,
  announced_at      timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_build_requests_one_active
  ON platform.app_build_requests (htx_code) WHERE status IN ('new', 'asking', 'spec_proposed', 'spec_approved', 'building');

CREATE TABLE IF NOT EXISTS platform.app_builds (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid        NOT NULL REFERENCES platform.app_build_requests(id) ON DELETE CASCADE,
  htx_code    text        NOT NULL,
  app_id      text        NOT NULL,
  version     text        NOT NULL,
  provider    text        NOT NULL,
  rounds      smallint    NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 3),
  status      text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed')),
  gates       jsonb       NOT NULL DEFAULT '[]',
  git_tag     text        NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  UNIQUE (app_id, version)
);

CREATE TABLE IF NOT EXISTS platform.app_build_files (
  build_id     uuid  NOT NULL REFERENCES platform.app_builds(id) ON DELETE CASCADE,
  name         text  NOT NULL CHECK (name IN ('desktop-light.png', 'desktop-dark.png', 'mobile-light.png', 'mobile-dark.png', 'review.md', 'spec.md')),
  content_type text  NOT NULL,
  bytes        bytea NOT NULL,
  PRIMARY KEY (build_id, name)
);

-- A generated app belongs to one cooperative and comes from a passed build (06-app-store.sql holds owner_htx; the
-- build reference lives here because the builds table is created above).
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS build_id uuid NULL REFERENCES platform.app_builds(id);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_build_requests
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_builds
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

-- Season strategy (M11): A11's quarterly plan, its warnings and its adoption.
CREATE TABLE IF NOT EXISTS platform.strategy_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code     text        NOT NULL,
  season       text        NOT NULL CHECK (season ~ '^[0-9]{4}-Q[1-4]$'),
  goals        jsonb       NOT NULL,
  priorities   jsonb       NOT NULL,
  initiatives  jsonb       NOT NULL,
  warnings     jsonb       NOT NULL DEFAULT '[]',
  status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'adopted', 'superseded')),
  proposal_id  uuid        NULL UNIQUE REFERENCES platform.agent_proposals(id) ON DELETE SET NULL,
  adopted_by   text        NULL,
  adopted_at   timestamptz NULL,
  run_id       uuid        NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, season, created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS strategy_plans_one_draft ON platform.strategy_plans (htx_code, season) WHERE status = 'draft';

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.strategy_plans
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
