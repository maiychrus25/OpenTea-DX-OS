-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Bulletins per cooperative (M4): a status (draft, published, rejected; drafts are not stored yet) and the owning
-- cooperative. Existing rows are shared bulletins from the n8n workflow, so htx_code stays null and they are published.
ALTER TABLE "bulletins" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "bulletins" ADD COLUMN "htx_code" TEXT;
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_status_check" CHECK ("status" IN ('draft', 'published', 'rejected'));
CREATE INDEX "bulletins_htx_code_commodity_is_latest_idx" ON "bulletins"("htx_code", "commodity", "is_latest");
