-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- External LLM providers (M3): the model per agent and the heartbeat's provider list. The tables live in the platform
-- schema (platform/postgres/init/08-agent.sql and 09-telegram.sql), outside Prisma's models; the same columns are in those
-- files for new databases. Guarded so a database without those schemas can still run the migration chain.
DO $$
BEGIN
  IF to_regclass('platform.agent_settings') IS NOT NULL THEN
    ALTER TABLE platform.agent_settings ADD COLUMN IF NOT EXISTS model text;
  END IF;
  IF to_regclass('platform.service_heartbeats') IS NOT NULL THEN
    ALTER TABLE platform.service_heartbeats ADD COLUMN IF NOT EXISTS details jsonb;
  END IF;
END $$;
