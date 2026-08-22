// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

const commodityMap: Record<string, string> = {
  'Gạo': 'Rice',
  'Cà phê': 'Coffee',
  'Hạt tiêu': 'Pepper',
  'Sắn': 'Cassava',
  'Cao su': 'Rubber',
  'Nông sản': 'Agricultural Products',
  'Nông sản (VN)': 'Agricultural Products (VN)',
  'Ngũ cốc': 'Cereals',
  'Khí hậu': 'Climate'
};

const reverseCommodityMap: Record<string, string> = Object.fromEntries(
  Object.entries(commodityMap).map(([vi, en]) => [en, vi])
);

export function toEnglishCommodity(viName: string): string {
  // If the input exists as a key in reverseCommodityMap, it IS already an English name (e.g. 'Rice').
  // reverseCommodityMap maps English → Vietnamese, so if viName is found there, it's English — return as-is.
  if (reverseCommodityMap[viName]) return viName;
  return commodityMap[viName] || viName;
}

export function toVietnameseCommodity(enName: string): string {
  return reverseCommodityMap[enName] || enName;
}
