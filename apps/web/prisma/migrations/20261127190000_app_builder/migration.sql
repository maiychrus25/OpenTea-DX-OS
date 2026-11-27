-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Mini-app factory (M13): requests, builds and build files, the owner and build of a catalogue row, the app_answer
-- conversation kind and the photos of an outbox message. The tables live in the platform schema (08-agent.sql,
-- 06-app-store.sql, 09-telegram.sql), outside Prisma's models; the same statements are in those files for new databases.
-- Guarded like the M7 and M12 migrations.
DO $$
BEGIN
  IF to_regclass('platform.agent_proposals') IS NOT NULL AND to_regprocedure('audit.capture_row()') IS NOT NULL THEN
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

    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_build_requests
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON platform.app_builds
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();

    IF to_regclass('platform.app_catalog') IS NOT NULL THEN
      ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS owner_htx text NULL;
      ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS build_id uuid NULL REFERENCES platform.app_builds(id);
    END IF;
  END IF;

  IF to_regclass('platform.telegram_conversations') IS NOT NULL THEN
    ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_kind_check;
    ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_kind_check
      -- 'voice' (M15) is kept: this migration runs after the one that adds it.
      CHECK (kind IN ('reject_reason', 'flow', 'voice', 'app_answer'));
  END IF;

  IF to_regclass('platform.telegram_outbox') IS NOT NULL THEN
    ALTER TABLE platform.telegram_outbox ADD COLUMN IF NOT EXISTS photos jsonb NULL;
  END IF;
END $$;
