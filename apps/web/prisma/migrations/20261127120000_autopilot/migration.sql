-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Autonomous mode (M12): the autopilot table and the shadow, window and block columns of a proposal. They live in the
-- platform schema (platform/postgres/init/08-agent.sql), outside Prisma's models; the same statements are in that file
-- for new databases. Guarded like the M7 and M8 migrations.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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
  END IF;
END $$;
