-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Telegram chat assistant (M5): flows and cards in the conversations table, the rate-limit column on seen updates and the
-- assistant request table. The tables live in the platform schema (platform/postgres/init/09-telegram.sql), outside Prisma's
-- models; the same statements are in that file for new databases. Guarded so a database without those tables still migrates.
DO $$
BEGIN
  IF to_regclass('platform.telegram_conversations') IS NOT NULL THEN
    ALTER TABLE platform.telegram_conversations ALTER COLUMN proposal_id DROP NOT NULL;
    ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_kind_check;
    ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_kind_check
      CHECK (kind IN ('reject_reason', 'flow'));
    ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_proposal_check;
    ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_proposal_check
      CHECK ((kind = 'reject_reason') = (proposal_id IS NOT NULL));
    ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS flow text;
    ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS step integer;
    ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}';
    ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS token text;
    ALTER TABLE platform.telegram_conversations ADD COLUMN IF NOT EXISTS card_message_id bigint;
  END IF;

  IF to_regclass('platform.telegram_updates_seen') IS NOT NULL THEN
    ALTER TABLE platform.telegram_updates_seen ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
    CREATE INDEX IF NOT EXISTS telegram_updates_seen_user
      ON platform.telegram_updates_seen (telegram_user_id, seen_at);
  END IF;

  IF to_regclass('platform.assistant_requests') IS NULL AND to_regclass('platform.telegram_updates_seen') IS NOT NULL THEN
    CREATE TABLE platform.assistant_requests (
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
    CREATE INDEX assistant_requests_htx_status ON platform.assistant_requests (htx_code, status, created_at);
  END IF;
END $$;
