-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Agentic layer (milestone M2): Telegram links, outbox, conversations, reports, heartbeats and system alerts. Idempotent.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.telegram_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text        NOT NULL CHECK (kind IN ('user', 'group')),
  user_id           text,
  user_name         text,
  role              text,
  htx_code          text        NOT NULL,
  telegram_user_id  bigint,
  chat_id           bigint      NOT NULL,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  unlinked_at       timestamptz,
  CHECK ((kind = 'user' AND user_id IS NOT NULL AND telegram_user_id IS NOT NULL)
      OR (kind = 'group' AND user_id IS NULL AND telegram_user_id IS NULL))
);

-- One active link per Telegram account and per user; one active group per cooperative.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_telegram_user
  ON platform.telegram_links (telegram_user_id) WHERE kind = 'user' AND unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_user
  ON platform.telegram_links (user_id) WHERE kind = 'user' AND unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_group_htx
  ON platform.telegram_links (htx_code) WHERE kind = 'group' AND unlinked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.telegram_link_codes (
  code_hash   text        PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('user', 'group')),
  user_id     text        NOT NULL,
  user_name   text,
  role        text,
  htx_code    text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE IF NOT EXISTS platform.telegram_outbox (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code            text,
  chat_id             bigint      NOT NULL,
  op                  text        NOT NULL CHECK (op IN ('send', 'edit')),
  text                text        NOT NULL,
  buttons             jsonb,
  edit_message_id     bigint,
  proposal_id         uuid        REFERENCES platform.agent_proposals(id),
  purpose             text        NOT NULL CHECK (purpose IN ('proposal', 'result', 'report', 'health', 'reply')),
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'sent', 'failed')),
  attempts            integer     NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  lease_until         timestamptz,
  telegram_message_id bigint,
  last_error          text,
  health_key          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_outbox_due
  ON platform.telegram_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS telegram_outbox_proposal
  ON platform.telegram_outbox (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telegram_outbox_health_key
  ON platform.telegram_outbox (health_key, created_at) WHERE health_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.telegram_conversations (
  telegram_user_id  bigint      PRIMARY KEY,
  kind              text        NOT NULL CHECK (kind IN ('reject_reason')),
  proposal_id       uuid        NOT NULL REFERENCES platform.agent_proposals(id),
  expires_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS platform.telegram_updates_seen (
  update_id  bigint      PRIMARY KEY,
  seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.service_heartbeats (
  service      text        PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version      text
);

CREATE TABLE IF NOT EXISTS platform.system_alerts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL CHECK (source IN ('n8n', 'agent', 'web')),
  htx_code    text,
  title       text        NOT NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS system_alerts_unnotified
  ON platform.system_alerts (created_at) WHERE notified_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.agent_reports (
  htx_code     text        NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('daily', 'weekly')),
  period_start date        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (htx_code, kind, period_start)
);

CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_links
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_link_codes
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_outbox
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_conversations
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_updates_seen
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.service_heartbeats
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.system_alerts
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.agent_reports
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
