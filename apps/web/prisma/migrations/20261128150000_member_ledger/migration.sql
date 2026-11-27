-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 1 S4: input items and advances, settlement periods and lines, and the append-only member ledger.
-- CreateEnum
CREATE TYPE "InputKind" AS ENUM ('FERTILIZER', 'PESTICIDE', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('LEAF_CREDIT', 'INPUT_DEBIT', 'PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CASH');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "bank_account" TEXT,
ADD COLUMN     "bank_account_name" TEXT,
ADD COLUMN     "bank_bin" TEXT;

-- CreateTable
CREATE TABLE "input_items" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,
    "kind" "InputKind" NOT NULL,
    "pesticide_product_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "input_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "input_advances" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "advance_no" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" DECIMAL(9,2) NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "advanced_on" DATE NOT NULL,
    "status" "LeafTicketStatus" NOT NULL DEFAULT 'VALID',
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "settlement_id" TEXT,
    "client_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_periods" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" TEXT,
    "closed_by_name" TEXT,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "settlement_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_settlements" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "leaf_net_kg" DECIMAL(10,1) NOT NULL,
    "leaf_amount_vnd" BIGINT NOT NULL,
    "advances_vnd" BIGINT NOT NULL,
    "debt_in_vnd" BIGINT NOT NULL,
    "payable_vnd" BIGINT NOT NULL,
    "debt_out_vnd" BIGINT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_by_id" TEXT,
    "payment_method" "PaymentMethod",
    "payment_ref" TEXT,

    CONSTRAINT "member_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_ledger_entries" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "ticket_id" TEXT,
    "advance_id" TEXT,
    "settlement_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "input_items_htx_profile_id_name_key" ON "input_items"("htx_profile_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "input_advances_advance_no_key" ON "input_advances"("advance_no");

-- CreateIndex
CREATE INDEX "input_advances_htx_profile_id_advanced_on_idx" ON "input_advances"("htx_profile_id", "advanced_on");

-- CreateIndex
CREATE INDEX "input_advances_household_id_idx" ON "input_advances"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "input_advances_created_by_id_client_id_key" ON "input_advances"("created_by_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_periods_code_key" ON "settlement_periods"("code");

-- CreateIndex
CREATE INDEX "settlement_periods_htx_profile_id_date_from_idx" ON "settlement_periods"("htx_profile_id", "date_from");

-- CreateIndex
CREATE INDEX "member_settlements_household_id_idx" ON "member_settlements"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_settlements_period_id_household_id_key" ON "member_settlements"("period_id", "household_id");

-- CreateIndex
CREATE INDEX "member_ledger_entries_household_id_created_at_idx" ON "member_ledger_entries"("household_id", "created_at");

-- AddForeignKey
ALTER TABLE "fresh_leaf_tickets" ADD CONSTRAINT "fresh_leaf_tickets_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "member_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_items" ADD CONSTRAINT "input_items_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_items" ADD CONSTRAINT "input_items_pesticide_product_id_fkey" FOREIGN KEY ("pesticide_product_id") REFERENCES "pesticide_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "input_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "member_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_periods" ADD CONSTRAINT "settlement_periods_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_settlements" ADD CONSTRAINT "member_settlements_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "settlement_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_settlements" ADD CONSTRAINT "member_settlements_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_ledger_entries" ADD CONSTRAINT "member_ledger_entries_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_ledger_entries" ADD CONSTRAINT "member_ledger_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_ledger_entries" ADD CONSTRAINT "member_ledger_entries_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "member_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The database refuses what the app already refuses.
ALTER TABLE "households" ADD CONSTRAINT "households_bank_check" CHECK (
  ("bank_bin" IS NULL OR "bank_bin" ~ '^[0-9]{6}$') AND ("bank_account" IS NULL OR "bank_account" ~ '^[0-9]{6,19}$'));
ALTER TABLE "input_items" ADD CONSTRAINT "input_items_price_check" CHECK ("unit_price_vnd" BETWEEN 0 AND 100000000);
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "input_advances" ADD CONSTRAINT "input_advances_amount_check" CHECK ("amount_vnd" >= 0 AND "unit_price_vnd" >= 0);
ALTER TABLE "settlement_periods" ADD CONSTRAINT "settlement_periods_range_check" CHECK ("date_from" <= "date_to");
ALTER TABLE "member_settlements" ADD CONSTRAINT "member_settlements_amounts_check" CHECK ("payable_vnd" >= 0 AND "debt_out_vnd" >= 0 AND "debt_in_vnd" >= 0);

-- The ledger only ever grows: a correction is a new ADJUSTMENT row, never an UPDATE or DELETE.
CREATE OR REPLACE FUNCTION public.member_ledger_entries_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'member_ledger_entries is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER member_ledger_entries_append_only BEFORE UPDATE OR DELETE ON "member_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION public.member_ledger_entries_refuse_change();
CREATE TRIGGER member_ledger_entries_no_truncate BEFORE TRUNCATE ON "member_ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION public.member_ledger_entries_refuse_change();

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.input_items
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.input_advances
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.settlement_periods
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.member_settlements
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.member_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
