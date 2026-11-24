-- SPDX-License-Identifier: MIT
-- Upgrade for databases created by 1.0.0: evidence attached to leave requests (1.1.0).
-- The app applies the same change on start-up; run this by hand only for a DX-OS install managed by migrations.
ALTER TABLE app_staff_work.leave_requests ADD COLUMN IF NOT EXISTS attachment_path character varying(260) NULL;
ALTER TABLE app_staff_work.leave_requests ADD COLUMN IF NOT EXISTS attachment_name character varying(120) NULL;
ALTER TABLE app_staff_work.leave_requests ADD COLUMN IF NOT EXISTS attachment_content_type character varying(60) NULL;
