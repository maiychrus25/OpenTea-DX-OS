-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Gói trải nghiệm nổi bật trên trang chủ khách (tối đa 6 gói, kiểm trong app).
ALTER TABLE experiences ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
CREATE INDEX experiences_htx_featured ON experiences (htx_code, sort_order) WHERE is_featured;
