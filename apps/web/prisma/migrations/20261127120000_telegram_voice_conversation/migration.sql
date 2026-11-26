-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Telegram voice messages (M15): the conversation kind `voice` holds a heard sentence until the person presses Đúng.
-- The table lives in the platform schema (platform/postgres/init/09-telegram.sql); the same statement is in that file for
-- new databases. Guarded so a database without the table still migrates.
DO $$
BEGIN
  IF to_regclass('platform.telegram_conversations') IS NOT NULL THEN
    ALTER TABLE platform.telegram_conversations DROP CONSTRAINT IF EXISTS telegram_conversations_kind_check;
    ALTER TABLE platform.telegram_conversations ADD CONSTRAINT telegram_conversations_kind_check
      CHECK (kind IN ('reject_reason', 'flow', 'voice'));
  END IF;
END
$$;
