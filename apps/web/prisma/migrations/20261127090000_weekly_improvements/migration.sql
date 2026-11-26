-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Weekly improvements (M8): the improvements table. It lives in the platform schema (platform/postgres/init/08-agent.sql),
-- outside Prisma's models; the same statements are in that file for new databases. Guarded like the M7 migration.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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
  END IF;
END $$;
