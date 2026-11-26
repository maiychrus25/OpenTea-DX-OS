-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Daily campaign (M7): campaigns, their items and the 18:00 outcomes. The tables live in the platform schema
-- (platform/postgres/init/08-agent.sql), outside Prisma's models; the same statements are in that file for new databases.
-- Guarded so a database without the platform schema can still run the migration chain.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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
      proposal_id uuid    NOT NULL REFERENCES platform.agent_proposals(id),
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
  END IF;
END $$;
