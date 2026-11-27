ALTER TABLE "partners" ADD COLUMN "htx_profile_id" TEXT;
CREATE INDEX "partners_htx_profile_id_idx" ON "partners"("htx_profile_id");
ALTER TABLE "partners" ADD CONSTRAINT "partners_htx_profile_id_fkey"
  FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing partners were demo data: give them to HTX TC, or to the only HTX if there is exactly one.
UPDATE "partners" SET "htx_profile_id" = COALESCE(
  (SELECT "id" FROM "htx_profiles" WHERE "htx_code" = 'TC'),
  (SELECT "id" FROM "htx_profiles" WHERE (SELECT count(*) FROM "htx_profiles") = 1)
) WHERE "htx_profile_id" IS NULL;
