-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Staff tasks (M10): the roster and attendance tables, the staff app's task id on a proposal and the new proposal status.
-- They live in the platform schema (platform/postgres/init/08-agent.sql), outside Prisma's models; the same statements
-- are in that file for new databases. Guarded like the M7 migration.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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
  END IF;
END $$;
