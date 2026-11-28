-- Phase 1 S1: plucking flush links, pesticide catalogue, HTX labels.

-- CreateEnum
CREATE TYPE "PesticideGroup" AS ENUM ('BOTANICAL', 'MICROBIAL', 'BIOLOGICAL', 'CHEMICAL', 'ANTIBIOTIC');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "cycle_id" TEXT;

-- AlterTable
ALTER TABLE "journal_activities" ADD COLUMN     "pesticide_product_id" TEXT;

-- AlterTable
ALTER TABLE "lot_parcels" ADD COLUMN     "cycle_id" TEXT;

-- CreateTable
CREATE TABLE "pesticide_products" (
    "id" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "active_ingredient" TEXT NOT NULL,
    "group" "PesticideGroup" NOT NULL,
    "targets" TEXT[],
    "default_phi_days" INTEGER NOT NULL,
    "phi_needs_label_check" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesticide_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "htx_pesticide_labels" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "pesticide_product_id" TEXT NOT NULL,
    "label_phi_days" INTEGER NOT NULL,
    "label_note" TEXT,
    "verified_by_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "htx_pesticide_labels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "htx_pesticide_labels_label_phi_days_check" CHECK ("label_phi_days" BETWEEN 1 AND 365)
);

-- CreateIndex
CREATE UNIQUE INDEX "pesticide_products_trade_name_key" ON "pesticide_products"("trade_name");

-- CreateIndex
CREATE UNIQUE INDEX "htx_pesticide_labels_htx_profile_id_pesticide_product_id_key" ON "htx_pesticide_labels"("htx_profile_id", "pesticide_product_id");

-- CreateIndex
CREATE INDEX "journal_entries_cycle_id_idx" ON "journal_entries"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_submitted_by_id_client_id_key" ON "journal_entries"("submitted_by_id", "client_id");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "parcel_crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_activities" ADD CONSTRAINT "journal_activities_pesticide_product_id_fkey" FOREIGN KEY ("pesticide_product_id") REFERENCES "pesticide_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "htx_pesticide_labels" ADD CONSTRAINT "htx_pesticide_labels_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "htx_pesticide_labels" ADD CONSTRAINT "htx_pesticide_labels_pesticide_product_id_fkey" FOREIGN KEY ("pesticide_product_id") REFERENCES "pesticide_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_parcels" ADD CONSTRAINT "lot_parcels_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "parcel_crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starting catalogue: 20 products from the Thai Nguyen Plant Protection Sub-Department sheets that PR #99
-- transcribed. Floors: botanical, microbial, biological 7 days; chemical, antibiotic 14 days.
-- Every row keeps phi_needs_label_check = true until an HTX checks the real label.
-- The two products flagged in the source "discrepancies" section are left out on purpose.
INSERT INTO "pesticide_products" ("id", "trade_name", "active_ingredient", "group", "targets", "default_phi_days", "source", "updated_at")
SELECT gen_random_uuid()::text, v.trade_name, v.active_ingredient, v.grp::"PesticideGroup", v.targets, v.phi, v.source, CURRENT_TIMESTAMP
FROM (VALUES
  ('Minup 0.3EC', 'Azadirachtin', 'BOTANICAL', ARRAY['Rầy xanh','Bọ cánh tơ','Nhện đỏ','Bọ xít muỗi'], 7, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Miktin 3.6EC', 'Abamectin', 'CHEMICAL', ARRAY['Rầy xanh','Bọ cánh tơ (ghi "bọ trĩ")','Nhện đỏ','Bọ xít muỗi'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Reasgant 3.6EC', 'Abamectin', 'CHEMICAL', ARRAY['Rầy xanh','Bọ cánh tơ','Nhện đỏ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Reasgant 5WG', 'Abamectin', 'CHEMICAL', ARRAY['Bọ cánh tơ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Aremec 45EC', 'Abamectin', 'CHEMICAL', ARRAY['Rầy xanh','Bọ cánh tơ','Nhện đỏ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Nimbus 6.0EC', 'Abamectin', 'CHEMICAL', ARRAY['Bọ cánh tơ','Nhện đỏ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('BP Dy Gan 5.4EC', 'Abamectin', 'CHEMICAL', ARRAY['Bọ cánh tơ','Nhện đỏ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Catex 3.6EC', 'Abamectin', 'CHEMICAL', ARRAY['Bọ cánh tơ','Nhện đỏ'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Vinup 40EC', 'Abamectin + Azadirachtin', 'CHEMICAL', ARRAY['Rầy xanh','Bọ cánh tơ','Bọ xít muỗi'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Sieufatoc 36EC', 'Abamectin + Emamectin benzoate', 'CHEMICAL', ARRAY['Rầy xanh','Bọ cánh tơ','Bọ xít muỗi'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Stifano 5.5SL', 'Cucuminoid + Gingerol', 'BOTANICAL', ARRAY['Phồng lá'], 7, 'Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên'),
  ('Manage 5WP', 'Imibenconazole', 'CHEMICAL', ARRAY['Phồng lá'], 14, 'Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên'),
  ('Starsuper 20WP', 'Kasugamycin + Polyoxin', 'ANTIBIOTIC', ARRAY['Phồng lá'], 14, 'Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên'),
  ('Yomisuper 23WP', 'Kasugamycin + Polyoxin', 'ANTIBIOTIC', ARRAY['Phồng lá'], 14, 'Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên'),
  ('Biobus 1.00WP', 'Trichoderma', 'MICROBIAL', ARRAY['Khô cành, chết ngọn','Chấm xám','Thối búp'], 7, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Promot Plus SL', 'Trichoderma', 'MICROBIAL', ARRAY['Khô cành, chết ngọn','Đốm nâu','Đốm xám'], 7, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Olicide 9SL', 'Oligo-sacarit', 'BIOLOGICAL', ARRAY['Khô cành, chết ngọn','Rỉ sắt'], 7, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Antracol 70WP', 'Propineb', 'CHEMICAL', ARRAY['Khô cành, chết ngọn','Thán thư'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Daconil 75WP', 'Chlorothalonil', 'CHEMICAL', ARRAY['Khô cành, chết ngọn','Đốm lá','Thán thư'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT'),
  ('Daconil 500SC', 'Chlorothalonil', 'CHEMICAL', ARRAY['Khô cành, chết ngọn','Đốm lá','Thán thư'], 14, 'Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT')
) AS v(trade_name, active_ingredient, grp, targets, phi, source)
ON CONFLICT ("trade_name") DO NOTHING;

-- Backfill journal entries: the flush that had started by entry_date; if that flush closed before entry_date,
-- the open flush; if none started yet, the earliest flush.
UPDATE "journal_entries" je SET "cycle_id" = COALESCE(
  (SELECT c.id FROM "parcel_crop_cycles" c
     WHERE c.parcel_id = je.parcel_id AND c.harvested_at IS NULL
       AND je.entry_date > (SELECT s.harvested_at FROM "parcel_crop_cycles" s
                             WHERE s.parcel_id = je.parcel_id AND COALESCE(s.sowed_at, s.created_at) <= je.entry_date
                             ORDER BY COALESCE(s.sowed_at, s.created_at) DESC, s.created_at DESC LIMIT 1)
     ORDER BY c.created_at DESC LIMIT 1),
  (SELECT s.id FROM "parcel_crop_cycles" s
     WHERE s.parcel_id = je.parcel_id AND COALESCE(s.sowed_at, s.created_at) <= je.entry_date
     ORDER BY COALESCE(s.sowed_at, s.created_at) DESC, s.created_at DESC LIMIT 1),
  (SELECT s.id FROM "parcel_crop_cycles" s WHERE s.parcel_id = je.parcel_id
     ORDER BY COALESCE(s.sowed_at, s.created_at) ASC, s.created_at ASC LIMIT 1)
) WHERE je.cycle_id IS NULL;

-- Backfill lot lines: the flush harvested on or before the lot's harvest date, else the newest flush.
UPDATE "lot_parcels" lp SET "cycle_id" = COALESCE(
  (SELECT c.id FROM "parcel_crop_cycles" c JOIN "lots" l ON l.id = lp.lot_id
     WHERE c.parcel_id = lp.parcel_id AND c.harvested_at IS NOT NULL AND c.harvested_at <= l.harvest_date
     ORDER BY c.harvested_at DESC LIMIT 1),
  (SELECT c.id FROM "parcel_crop_cycles" c WHERE c.parcel_id = lp.parcel_id
     ORDER BY c.created_at DESC LIMIT 1)
) WHERE lp.cycle_id IS NULL;

-- Audit triggers for the new tables (the init script covers fresh databases; this covers running ones).
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.pesticide_products
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.htx_pesticide_labels
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
