// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Pure: safe to import from client components. A copy of `disease_labels` (migration 20261128180000) for the codes an
// agent may propose as a disease: no `healthy`, `not_tea_leaf` or `other`. A test keeps it equal to the seeded table.
export const DISEASE_LABEL_VI: Readonly<Record<string, string>> = {
  green_leafhopper: 'Rầy xanh',
  tea_thrips: 'Bọ cánh tơ',
  red_spider_mite: 'Nhện đỏ',
  blister_blight: 'Phồng lá chè',
  algal_leaf_spot: 'Bệnh đốm tảo',
  birds_eye_spot: 'Bệnh đốm mắt chim (bird\'s eye spot)',
  brown_blight: 'Brown blight',
  gray_blight: 'Bệnh chấm xám',
  helopeltis: 'Bọ xít muỗi',
  red_leaf_spot: 'Bệnh đốm đỏ (red leaf spot)',
  white_spot: 'Bệnh đốm trắng (white spot)',
}
