-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- GĐ4-B B1: one list of disease/pest labels, the officer's confirmed label on a report, and the model version.
-- CreateEnum
CREATE TYPE "DiseaseLabelGroup" AS ENUM ('PEST', 'DISEASE', 'HEALTHY', 'OTHER');

-- CreateTable
CREATE TABLE "disease_labels" (
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "scientific_name" TEXT,
    "group" "DiseaseLabelGroup" NOT NULL,
    "is_target" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "disease_labels_pkey" PRIMARY KEY ("code")
);

-- The five targets first, then the classes of the current tea model, then the catch-alls.
INSERT INTO "disease_labels" ("code", "name_vi", "scientific_name", "group", "is_target", "sort_order") VALUES
  ('green_leafhopper', 'Rầy xanh', 'Empoasca onukii', 'PEST', true, 10),
  ('tea_thrips', 'Bọ cánh tơ', 'Scirtothrips dorsalis', 'PEST', true, 20),
  ('red_spider_mite', 'Nhện đỏ', 'Oligonychus coffeae', 'PEST', true, 30),
  ('blister_blight', 'Phồng lá chè', 'Exobasidium vexans', 'DISEASE', true, 40),
  ('helopeltis', 'Bọ xít muỗi', 'Helopeltis theivora', 'PEST', true, 50),
  ('algal_leaf_spot', 'Bệnh đốm tảo', 'Cephaleuros parasiticus', 'DISEASE', false, 110),
  ('birds_eye_spot', 'Bệnh đốm mắt chim (bird''s eye spot)', NULL, 'DISEASE', false, 120),
  ('brown_blight', 'Brown blight', NULL, 'DISEASE', false, 130),
  ('gray_blight', 'Bệnh chấm xám', NULL, 'DISEASE', false, 140),
  ('red_leaf_spot', 'Bệnh đốm đỏ (red leaf spot)', NULL, 'DISEASE', false, 150),
  ('white_spot', 'Bệnh đốm trắng (white spot)', NULL, 'DISEASE', false, 160),
  ('healthy', 'Lá khoẻ', NULL, 'HEALTHY', false, 210),
  ('not_tea_leaf', 'Không phải lá chè', NULL, 'OTHER', false, 220),
  ('other', 'Khác', NULL, 'OTHER', false, 230);

-- AlterTable
ALTER TABLE "disease_reports" ADD COLUMN "confirmed_label_code" TEXT,
ADD COLUMN "model_version" TEXT;

-- CreateIndex
CREATE INDEX "disease_reports_confirmed_label_code_idx" ON "disease_reports"("confirmed_label_code");

-- AddForeignKey
ALTER TABLE "disease_reports" ADD CONSTRAINT "disease_reports_confirmed_label_code_fkey" FOREIGN KEY ("confirmed_label_code") REFERENCES "disease_labels"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- Old confirmed reports get a label only on an exact name match; the others stay empty.
UPDATE "disease_reports" r SET "confirmed_label_code" = l."code"
  FROM "disease_labels" l
  WHERE r."status" = 'CONFIRMED' AND r."confirmed_diagnosis" = l."name_vi";

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.disease_labels
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
