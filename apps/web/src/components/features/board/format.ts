// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** One decimal of kg, Vietnamese grouping and comma: 95 → "95,0". */
export const kgText = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Today against yesterday in tenths, so the difference has no float drift. */
export function changeText(today: number, yesterday: number): string {
  const diff = Math.round(today * 10) - Math.round(yesterday * 10)
  if (diff === 0) return 'Bằng hôm qua'
  if (yesterday === 0) return 'Hôm qua chưa có phiếu'
  return `${diff > 0 ? '+' : '−'}${kgText(Math.abs(diff) / 10)} kg so với hôm qua`
}

export const pricePerKg = (vnd: number) => `${vnd.toLocaleString('vi-VN')} đ/kg`
