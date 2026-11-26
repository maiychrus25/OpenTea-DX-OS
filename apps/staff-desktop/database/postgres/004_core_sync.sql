-- SPDX-License-Identifier: MIT
-- Upgrade for databases created before 1.4.0: tasks pulled from the DX-OS core keep the proposal id.
-- The app applies the same change on start-up; run this by hand only for a DX-OS install managed by migrations.

ALTER TABLE app_staff_work.work_tasks ADD COLUMN IF NOT EXISTS external_ref character varying(64);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_work_tasks_external_ref" ON app_staff_work.work_tasks (external_ref);
