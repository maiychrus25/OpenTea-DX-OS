-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Season strategy (M11): the strategy_plans table. It lives in the platform schema (platform/postgres/init/08-agent.sql),
-- outside Prisma's models; the same statements are in that file for new databases. Guarded like the M7 and M8 migrations.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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
  END IF;
END $$;
