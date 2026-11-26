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

-- Photos of a message (M13): [{build_id, name}], at most 4; the relay fetches each from the media route.
ALTER TABLE platform.telegram_outbox ADD COLUMN IF NOT EXISTS photos jsonb NULL;

CREATE INDEX IF NOT EXISTS telegram_outbox_due
  ON platform.telegram_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS telegram_outbox_proposal
  ON platform.telegram_outbox (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telegram_outbox_health_key
  ON platform.telegram_outbox (health_key, created_at) WHERE health_key IS NOT NULL;

-- Conversations (M2 reject reason, M5 chat flows and cards). A reject reason has a proposal; a flow has none.
CREATE TABLE IF NOT EXISTS platform.telegram_conversations (
  telegram_user_id  bigint      PRIMARY KEY,
  kind              text        NOT NULL CHECK (kind IN ('reject_reason', 'flow')),
  proposal_id       uuid        REFERENCES platform.agent_proposals(id),
  expires_at        timestamptz NOT NULL,
  flow              text,
  step              integer,
  state             jsonb       NOT NULL DEFAULT '{}',
  token             text,
  card_message_id   bigint
);
-- Upgrade of a database created by M2: the old table had NOT NULL proposal_id and only the reject kind.
ALTER TABLE platform.telegram_conversations ALTER COLUMN proposal_id DROP NOT NULL;
ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_kind_check;
ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_kind_check
  CHECK (kind IN ('reject_reason', 'flow', 'app_answer'));
ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_proposal_check;
ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_proposal_check
  CHECK ((kind = 'reject_reason') = (proposal_id IS NOT NULL));
ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS flow text;
ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS step integer;
ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS card_message_id bigint;

CREATE TABLE IF NOT EXISTS platform.telegram_updates_seen (
  update_id        bigint      PRIMARY KEY,
  seen_at          timestamptz NOT NULL DEFAULT now(),
  telegram_user_id bigint
);
-- Rate limit (M5): updates of one Telegram user in the last hour.
ALTER TABLE platform.telegram_updates_seen ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
CREATE INDEX IF NOT EXISTS telegram_updates_seen_user
  ON platform.telegram_updates_seen (telegram_user_id, seen_at);

-- Assistant requests (M5): a sentence the router could not place, claimed by agent A7. The text is blanked once done.
CREATE TABLE IF NOT EXISTS platform.assistant_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code          text        NOT NULL,
  telegram_user_id  bigint      NOT NULL,
  chat_id           bigint      NOT NULL,
  user_id           text        NOT NULL,
  role              text        NOT NULL CHECK (role IN ('farmer', 'officer', 'manager')),
  text              text        NOT NULL CHECK (char_length(text) <= 1000),
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'expired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  claimed_at        timestamptz,
  finished_at       timestamptz,
  run_id            uuid
);
CREATE INDEX IF NOT EXISTS assistant_requests_htx_status
  ON platform.assistant_requests (htx_code, status, created_at);

CREATE TABLE IF NOT EXISTS platform.service_heartbeats (
  service      text        PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version      text
);
-- Agent heartbeats list the external LLM providers whose keys the agent container holds (M3).
ALTER TABLE platform.service_heartbeats ADD COLUMN IF NOT EXISTS details jsonb;

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

-- Row audit only where a row is a decision worth keeping and has an id (audit.capture_row reads NEW.id):
-- who linked which Telegram account, and system alerts. The other tables are operational (codes, outbox leases,
-- conversations, update ids, heartbeats every minute, report markers) and would flood the hash chain.
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.telegram_links
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.system_alerts
  FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.telegram_link_codes;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.telegram_outbox;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.telegram_conversations;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.telegram_updates_seen;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.service_heartbeats;
DROP TRIGGER IF EXISTS dxos_audit_row ON platform.agent_reports;
