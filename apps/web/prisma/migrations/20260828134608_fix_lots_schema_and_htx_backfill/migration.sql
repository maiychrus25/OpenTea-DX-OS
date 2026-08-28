-- Migration: fix_lots_schema_and_htx_backfill
-- Story 7-0a (reopen): Fix lots table schema drift + add missing columns + HTX backfill
-- Copyright (c) 2026 Nguyen Tran Anh Hoang
-- Licensed under the MIT License.

-- ── Step 1: Fix journal_activities – add safe_harvest_date (missed in init migration) ──────────
ALTER TABLE "journal_activities"
  ADD COLUMN IF NOT EXISTS "safe_harvest_date" TIMESTAMP(3);

-- ── Step 2: Fix lots table – add columns missing after migration 20260814102205 ─────────────
-- Migration 20260814102205 recreated the lots table with an older schema shape.
-- The current Prisma schema expects these additional columns.

ALTER TABLE "lots"
  ADD COLUMN IF NOT EXISTS "harvest_date"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estimated_weight_kg"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actual_weight_kg"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "packaging_type"        TEXT,
  ADD COLUMN IF NOT EXISTS "destination"           TEXT,
  ADD COLUMN IF NOT EXISTS "buyer_name"            TEXT,
  ADD COLUMN IF NOT EXISTS "public_page_data"      JSONB,
  -- F2 fix: DEFAULT CURRENT_TIMESTAMP ensures no NULL for rows added after migration
  ADD COLUMN IF NOT EXISTS "updated_at"            TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Backfill updated_at for any existing rows that have NULL (belt-and-suspenders)
UPDATE "lots"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

-- ── Step 3: Backfill htx_profile_id for households (single-tenant: assign to first HTX) ───────
-- Safe: only updates rows where htx_profile_id is NULL and an HTX exists
UPDATE "households"
SET "htx_profile_id" = (SELECT "id" FROM "htx_profiles" ORDER BY "created_at" ASC LIMIT 1)
WHERE "htx_profile_id" IS NULL
  AND EXISTS (SELECT 1 FROM "htx_profiles");

-- ── Step 4: Backfill htx_profile_id for lots ────────────────────────────────────────────────
UPDATE "lots"
SET "htx_profile_id" = (SELECT "id" FROM "htx_profiles" ORDER BY "created_at" ASC LIMIT 1)
WHERE "htx_profile_id" IS NULL
  AND EXISTS (SELECT 1 FROM "htx_profiles");

-- ── Step 5: Add performance index for HTX-scoped lot queries ────────────────────────────────
-- Supports: SELECT * FROM lots WHERE htx_profile_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS "lots_htx_profile_id_status_idx" ON "lots"("htx_profile_id", "status");

-- ── Step 6: Add performance index for HTX-scoped household queries ───────────────────────────
CREATE INDEX IF NOT EXISTS "households_htx_profile_id_idx" ON "households"("htx_profile_id");
