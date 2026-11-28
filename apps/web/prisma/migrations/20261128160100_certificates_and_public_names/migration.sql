-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 2 track B: certificates with stored files, and the cooperative setting for names on the public page.
-- CreateEnum
CREATE TYPE "CertificateKind" AS ENUM ('VIETGAP', 'OCOP', 'ORGANIC', 'OTHER');

-- AlterTable
ALTER TABLE "htx_profiles" ADD COLUMN     "public_show_names" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "htx_certificates" (
    "id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "kind" "CertificateKind" NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "scope_note" TEXT,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_mime" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoke_reason" TEXT,

    CONSTRAINT "htx_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_certificates" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,

    CONSTRAINT "lot_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lot_certificates_lot_id_certificate_id_key" ON "lot_certificates"("lot_id", "certificate_id");

-- CreateIndex
CREATE INDEX "htx_certificates_htx_profile_id_expires_on_idx" ON "htx_certificates"("htx_profile_id", "expires_on");

-- AddForeignKey
ALTER TABLE "htx_certificates" ADD CONSTRAINT "htx_certificates_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_certificates" ADD CONSTRAINT "lot_certificates_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_certificates" ADD CONSTRAINT "lot_certificates_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "htx_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The database refuses what the app already refuses.
ALTER TABLE "htx_certificates" ADD CONSTRAINT "htx_certificates_dates_check" CHECK ("expires_on" >= "issued_on");
ALTER TABLE "htx_certificates" ADD CONSTRAINT "htx_certificates_text_check" CHECK (
  char_length("number") <= 60 AND char_length("issuer") <= 120 AND ("scope_note" IS NULL OR char_length("scope_note") <= 200));
ALTER TABLE "htx_certificates" ADD CONSTRAINT "htx_certificates_file_size_check" CHECK ("file_size" > 0 AND "file_size" <= 10485760);

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.htx_certificates
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.lot_certificates
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
