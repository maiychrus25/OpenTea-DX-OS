-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Phase 1 S2: the roles a person holds in one HTX. Keycloak stays the source of truth; requireTenant() syncs rows from the token.
CREATE TABLE "htx_memberships" (
    "id" TEXT NOT NULL,
    "keycloak_user_id" TEXT NOT NULL,
    "htx_profile_id" TEXT NOT NULL,
    "roles" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "htx_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "htx_memberships_keycloak_user_id_htx_profile_id_key" ON "htx_memberships"("keycloak_user_id", "htx_profile_id");
CREATE INDEX "htx_memberships_htx_profile_id_idx" ON "htx_memberships"("htx_profile_id");

ALTER TABLE "htx_memberships" ADD CONSTRAINT "htx_memberships_htx_profile_id_fkey"
  FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row audit, as in 03-audit-triggers.sql. Guarded: a database without the audit schema skips it.
DO $$
BEGIN
  IF to_regprocedure('audit.capture_row()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.htx_memberships
      FOR EACH ROW EXECUTE FUNCTION audit.capture_row();
  END IF;
END $$;
