-- Copyright (c) 2026 OpenTea Developers
-- Licensed under the MIT License. See LICENSE file in the project root for full license information.

-- =============================================================================
-- Story 7.0a: Data Backfill -- Set htx_profile_id for existing Household & Lot rows
-- =============================================================================
-- Context: Migration 20260814102205_add_htx_relations added htx_profile_id
--          as nullable column. All rows created BEFORE migration have NULL value.
--          This causes PrismaHouseholdRepository.findAll(htxProfileId) and
--          dashboard queries to return 0 rows for pre-migration data.
--
-- Prerequisites:
--   1. Run AFTER prisma migrate deploy completes successfully
--   2. Verify htx_profiles table has at least one record
--   3. Check for data in Lot (capitalized) table BEFORE applying migration
--      to avoid DROP TABLE data loss
--
-- Usage:
--   psql $DATABASE_URL -f scripts/backfill-htx-profile-id.sql
-- =============================================================================

-- STEP 0: Safety check
DO $$
DECLARE
  htx_count INT;
BEGIN
  SELECT COUNT(*) INTO htx_count FROM htx_profiles;
  IF htx_count = 0 THEN
    RAISE EXCEPTION 'No HTX profiles found. Create an HTX profile first before running backfill.';
  END IF;
  RAISE NOTICE 'Found % HTX profile(s). Proceeding with backfill...', htx_count;
END $$;

-- STEP 1: Inspect current state
SELECT
  'households_null' AS table_name,
  COUNT(*) AS rows_to_backfill
FROM households
WHERE htx_profile_id IS NULL
UNION ALL
SELECT
  'lots_null' AS table_name,
  COUNT(*) AS rows_to_backfill
FROM lots
WHERE htx_profile_id IS NULL;

-- STEP 2: Backfill households (single-HTX deployment)
UPDATE households
SET htx_profile_id = (
  SELECT id FROM htx_profiles ORDER BY created_at ASC LIMIT 1
)
WHERE htx_profile_id IS NULL;

SELECT COUNT(*) AS households_still_null FROM households WHERE htx_profile_id IS NULL;

-- STEP 3: Backfill lots (single-HTX deployment)
UPDATE lots
SET htx_profile_id = (
  SELECT id FROM htx_profiles ORDER BY created_at ASC LIMIT 1
)
WHERE htx_profile_id IS NULL;

SELECT COUNT(*) AS lots_still_null FROM lots WHERE htx_profile_id IS NULL;

-- STEP 4: Summary
SELECT 'htx_profiles' AS tbl, COUNT(*) AS total FROM htx_profiles
UNION ALL SELECT 'households', COUNT(*) FROM households
UNION ALL SELECT 'households_with_htx', COUNT(*) FROM households WHERE htx_profile_id IS NOT NULL
UNION ALL SELECT 'lots', COUNT(*) FROM lots
UNION ALL SELECT 'lots_with_htx', COUNT(*) FROM lots WHERE htx_profile_id IS NOT NULL;
