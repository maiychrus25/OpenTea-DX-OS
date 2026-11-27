-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 1 S3: leaf grades, the daily price per grade, and immutable fresh-leaf weighing tickets.
-- CreateEnum
CREATE TYPE "LeafTicketStatus" AS ENUM ('VALID', 'VOIDED');

-- CreateTable
CREATE TABLE "leaf_grades" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaf_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_leaf_prices" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "price_date" DATE NOT NULL,
    "price_vnd_per_kg" INTEGER NOT NULL,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_leaf_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fresh_leaf_tickets" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "ticket_no" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "grade_id" TEXT NOT NULL,
    "weighed_at" TIMESTAMP(3) NOT NULL,
    "gross_kg" DECIMAL(7,1) NOT NULL,
    "deduction_pct" DECIMAL(4,1) NOT NULL,
    "net_kg" DECIMAL(7,1) NOT NULL,
    "price_vnd_per_kg" INTEGER NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "status" "LeafTicketStatus" NOT NULL DEFAULT 'VALID',
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "client_id" TEXT,
    "settlement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fresh_leaf_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leaf_grades_htx_profile_id_name_key" ON "leaf_grades"("htx_profile_id", "name");

-- CreateIndex
CREATE INDEX "daily_leaf_prices_htx_profile_id_price_date_idx" ON "daily_leaf_prices"("htx_profile_id", "price_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_leaf_prices_grade_id_price_date_key" ON "daily_leaf_prices"("grade_id", "price_date");

-- CreateIndex
CREATE UNIQUE INDEX "fresh_leaf_tickets_ticket_no_key" ON "fresh_leaf_tickets"("ticket_no");

-- CreateIndex
CREATE INDEX "fresh_leaf_tickets_htx_profile_id_weighed_at_idx" ON "fresh_leaf_tickets"("htx_profile_id", "weighed_at");

-- CreateIndex
CREATE INDEX "fresh_leaf_tickets_household_id_idx" ON "fresh_leaf_tickets"("household_id");

-- CreateIndex
CREATE INDEX "fresh_leaf_tickets_parcel_id_idx" ON "fresh_leaf_tickets"("parcel_id");

-- CreateIndex
CREATE INDEX "fresh_leaf_tickets_cycle_id_idx" ON "fresh_leaf_tickets"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "fresh_leaf_tickets_created_by_id_client_id_key" ON "fresh_leaf_tickets"("created_by_id", "client_id");

-- AddForeignKey
ALTER TABLE "leaf_grades" ADD CONSTRAINT "leaf_grades_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_leaf_prices" ADD CONSTRAINT "daily_leaf_prices_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_leaf_prices" ADD CONSTRAINT "daily_leaf_prices_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "leaf_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "parcel_crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "leaf_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The database refuses what the app already refuses.
ALTER TABLE "daily_leaf_prices" ADD CONSTRAINT "daily_leaf_prices_price_check" CHECK ("price_vnd_per_kg" BETWEEN 1 AND 10000000);
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_price_check" CHECK ("price_vnd_per_kg" BETWEEN 1 AND 10000000);
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_deduction_check" CHECK ("deduction_pct" BETWEEN 0 AND 30);
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_gross_check" CHECK ("gross_kg" > 0 AND "gross_kg" <= 5000);

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.leaf_grades
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.daily_leaf_prices
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.fresh_leaf_tickets
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
