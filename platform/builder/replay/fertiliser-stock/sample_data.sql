-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Sample rows for the gates' run step and the preview screenshots; they exist only in a throwaway database.
INSERT INTO movements (htx_code, product, kind, quantity_kg, note, created_by, created_at) VALUES
  ('TC', 'NPK 16-16-8', 'in', 500, 'Nhập đợt đầu vụ xuân', 'sample-manager', now() - interval '10 days'),
  ('TC', 'NPK 16-16-8', 'out', 120, 'Chia cho tổ 1', 'sample-manager', now() - interval '6 days'),
  ('TC', 'Phân hữu cơ vi sinh', 'in', 300, '', 'sample-officer', now() - interval '5 days'),
  ('TC', 'Phân hữu cơ vi sinh', 'out', 80.5, 'Bón thử nương B2', 'sample-officer', now() - interval '2 days'),
  ('LB', 'Urê', 'in', 200, '', 'sample-lb', now() - interval '3 days');
