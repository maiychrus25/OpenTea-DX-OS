-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- GĐ4-B B2: a cooperative opts in to share confirmed disease photos for training the tea model. Off by default.
-- AlterTable (htx_profiles is already row-audited, so the switch leaves an audit event)
ALTER TABLE "htx_profiles" ADD COLUMN "disease_training_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "disease_training_consent_at" TIMESTAMP(3),
ADD COLUMN "disease_training_consent_by" TEXT;
