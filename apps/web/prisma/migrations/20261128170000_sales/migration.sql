-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 3 S8: sales orders drawn from lot stock, their lines in grams, and append-only payments.
-- CreateEnum
CREATE TYPE "SalesKind" AS ENUM ('WHOLESALE', 'RETAIL');

-- CreateEnum
CREATE TYPE "SalesSource" AS ENUM ('CORE', 'TEA_SHOP');

-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "kind" "SalesKind" NOT NULL,
    "source" "SalesSource" NOT NULL DEFAULT 'CORE',
    "external_ref" TEXT,
    "partner_id" TEXT,
    "customer_name" TEXT,
    "ordered_on" DATE NOT NULL,
    "due_on" DATE,
    "status" "SalesStatus" NOT NULL DEFAULT 'CONFIRMED',
    "total_vnd" BIGINT NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "net_g" INTEGER NOT NULL,
    "pack_count" INTEGER,
    "pack_net_g" INTEGER,
    "price_vnd_per_kg" INTEGER,
    "amount_vnd" BIGINT NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "ref" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_order_no_key" ON "sales_orders"("order_no");

-- CreateIndex
CREATE INDEX "sales_orders_htx_profile_id_ordered_on_idx" ON "sales_orders"("htx_profile_id", "ordered_on");

-- CreateIndex
CREATE INDEX "sales_orders_htx_profile_id_kind_status_due_on_idx" ON "sales_orders"("htx_profile_id", "kind", "status", "due_on");

-- CreateIndex
CREATE INDEX "sales_orders_partner_id_idx" ON "sales_orders"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_htx_profile_id_source_external_ref_key" ON "sales_orders"("htx_profile_id", "source", "external_ref");

-- CreateIndex
CREATE INDEX "sales_order_lines_order_id_idx" ON "sales_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "sales_order_lines_lot_id_idx" ON "sales_order_lines"("lot_id");

-- CreateIndex
CREATE INDEX "sales_payments_order_id_idx" ON "sales_payments"("order_id");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The database refuses what the app already refuses.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_total_check" CHECK ("total_vnd" >= 0);
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_due_check" CHECK ("due_on" IS NULL OR "due_on" >= "ordered_on");
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_kind_check" CHECK (
  ("kind" = 'WHOLESALE' AND "partner_id" IS NOT NULL) OR ("kind" = 'RETAIL' AND "due_on" IS NULL));
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_weight_check" CHECK ("net_g" > 0);
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_packs_check" CHECK (
  ("pack_count" IS NULL AND "pack_net_g" IS NULL)
  OR ("pack_count" > 0 AND "pack_net_g" > 0 AND "net_g" = "pack_count" * "pack_net_g"));
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_amount_check" CHECK ("amount_vnd" >= 0);
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_amount_check" CHECK ("amount_vnd" > 0);

-- Payments only ever grow: there is no correction, and an order with a payment cannot be cancelled.
CREATE OR REPLACE FUNCTION public.sales_payments_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sales_payments is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER sales_payments_append_only BEFORE UPDATE OR DELETE ON "sales_payments"
  FOR EACH ROW EXECUTE FUNCTION public.sales_payments_refuse_change();
CREATE TRIGGER sales_payments_no_truncate BEFORE TRUNCATE ON "sales_payments"
  FOR EACH STATEMENT EXECUTE FUNCTION public.sales_payments_refuse_change();

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.sales_payments
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
