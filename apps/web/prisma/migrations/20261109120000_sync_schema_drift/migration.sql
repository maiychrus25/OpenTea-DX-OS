-- Migration: sync_schema_drift
-- Brings the migration history in line with schema.prisma. Additive and idempotent, plus one safe backfill.

-- The new enum value is not used in this file, so it is safe inside the migration transaction.
ALTER TYPE "DiseaseReportStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "disease_reports" ADD COLUMN IF NOT EXISTS "treatment_recommendation" TEXT;
ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "photo_minio_key" TEXT,
  ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "parcel_crop_cycles" ADD COLUMN IF NOT EXISTS "estimated_harvest_date" TIMESTAMP(3);
ALTER TABLE "weather_cache" ADD COLUMN IF NOT EXISTS "forecast_json" JSONB;

-- schema.prisma requires harvest_date; fill the gaps before SET NOT NULL.
UPDATE "lots" SET "harvest_date" = "created_at" WHERE "harvest_date" IS NULL;
ALTER TABLE "lots" ALTER COLUMN "harvest_date" SET NOT NULL;
