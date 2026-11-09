-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Migration: notifications_htx
-- A broadcast (recipient_id IS NULL) belongs to one HTX. Additive and idempotent. Old rows stay NULL and are shown to nobody.

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "htx_profile_id" TEXT;

CREATE INDEX IF NOT EXISTS "notifications_htx_profile_id_idx" ON "notifications"("htx_profile_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_htx_profile_id_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_htx_profile_id_fkey"
      FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
