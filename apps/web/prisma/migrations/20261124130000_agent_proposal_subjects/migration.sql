-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- The agent tables live in the platform schema (platform/postgres/init/08-agent.sql), outside Prisma's models.
-- Guarded so a database without that schema can still run the migration chain.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL THEN
    ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS subject_ids text[] NOT NULL DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS agent_proposals_subject_ids ON platform.agent_proposals USING GIN (subject_ids);
  END IF;
END $$;
