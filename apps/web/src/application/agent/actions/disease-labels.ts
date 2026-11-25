// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Pure: safe to import from client components. Mirrors the `vi` labels of ai-models/tea_class_names_vi.json,
// without `healthy`, which is never proposed as a disease.
export const DISEASE_LABEL_VI: Readonly<Record<string, string>> = {
  algal_leaf_spot: 'Bệnh đốm tảo',
  birds_eye_spot: 'Bệnh đốm mắt chim (bird\'s eye spot)',
  brown_blight: 'Brown blight',
  gray_blight: 'Bệnh chấm xám',
  helopeltis: 'Bọ xít muỗi',
  red_leaf_spot: 'Bệnh đốm đỏ (red leaf spot)',
  white_spot: 'Bệnh đốm trắng (white spot)',
}
