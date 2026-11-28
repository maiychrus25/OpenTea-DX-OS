-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 2 A1: processing batches, dry tea outputs, and the sources of a lot.
-- CreateEnum
CREATE TYPE "ProcessingBatchStatus" AS ENUM ('OPEN', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DryTeaGrade" AS ENUM ('DINH', 'TOM_NON', 'MOC_CAU', 'BOM', 'CAM');

-- AlterTable
ALTER TABLE "fresh_leaf_tickets" ADD COLUMN     "processing_batch_id" TEXT;

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "dry_grade" "DryTeaGrade";

-- CreateTable
CREATE TABLE "processing_batches" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "batch_code" TEXT NOT NULL,
    "processed_on" DATE NOT NULL,
    "status" "ProcessingBatchStatus" NOT NULL DEFAULT 'OPEN',
    "master_name" TEXT,
    "shift" TEXT,
    "notes" TEXT,
    "fresh_kg" DECIMAL(10,1),
    "dry_kg" DECIMAL(10,1),
    "recovery_ratio" DECIMAL(5,2),
    "out_of_band" BOOLEAN NOT NULL DEFAULT false,
    "deviation_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_by_id" TEXT,
    "finished_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "processing_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_batch_outputs" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "grade" "DryTeaGrade" NOT NULL,
    "kg" DECIMAL(9,1) NOT NULL,

    CONSTRAINT "processing_batch_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_batch_sources" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "output_id" TEXT NOT NULL,
    "kg" DECIMAL(9,1) NOT NULL,

    CONSTRAINT "lot_batch_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_batches_batch_code_key" ON "processing_batches"("batch_code");

-- CreateIndex
CREATE INDEX "processing_batches_htx_profile_id_processed_on_idx" ON "processing_batches"("htx_profile_id", "processed_on");

-- CreateIndex
CREATE UNIQUE INDEX "processing_batch_outputs_batch_id_grade_key" ON "processing_batch_outputs"("batch_id", "grade");

-- CreateIndex
CREATE INDEX "lot_batch_sources_output_id_idx" ON "lot_batch_sources"("output_id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_batch_sources_lot_id_output_id_key" ON "lot_batch_sources"("lot_id", "output_id");

-- CreateIndex
CREATE INDEX "fresh_leaf_tickets_processing_batch_id_idx" ON "fresh_leaf_tickets"("processing_batch_id");

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_processing_batch_id_fkey" FOREIGN KEY ("processing_batch_id") REFERENCES "processing_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batch_outputs" ADD CONSTRAINT "processing_batch_outputs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_batch_sources" ADD CONSTRAINT "lot_batch_sources_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_batch_sources" ADD CONSTRAINT "lot_batch_sources_output_id_fkey" FOREIGN KEY ("output_id") REFERENCES "processing_batch_outputs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The database refuses what the app already refuses.
ALTER TABLE "processing_batch_outputs" ADD CONSTRAINT "processing_batch_outputs_kg_check" CHECK ("kg" > 0 AND "kg" <= 100000);
ALTER TABLE "lot_batch_sources" ADD CONSTRAINT "lot_batch_sources_kg_check" CHECK ("kg" > 0);
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_totals_check" CHECK (
  ("fresh_kg" IS NULL OR "fresh_kg" >= 0) AND ("dry_kg" IS NULL OR "dry_kg" >= 0) AND ("recovery_ratio" IS NULL OR "recovery_ratio" > 0));

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.processing_batches
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.processing_batch_outputs
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.lot_batch_sources
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
