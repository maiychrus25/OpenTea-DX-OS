// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * Short Vietnamese sentences for the listen buttons. Each takes only what the screen already shows, so no bank
 * number or full phone can reach the speech, and the callers never pass account details.
 */

/** Today's prices, one grade after another. */
export function priceSentence(grades: { grade_name: string; price_vnd_per_kg: number }[]): string {
  if (grades.length === 0) return 'Hôm nay HTX chưa công bố giá thu mua.'
  const items = grades.map(g => `${g.grade_name}, ${g.price_vnd_per_kg.toLocaleString('vi-VN')} đồng một ki-lô-gam`)
  return `Giá thu mua hôm nay: ${items.join('. ')}.`
}

/** The activity being logged, with the one reminder the form already states for sprayings. */
export function activitySentence(label: string, isSpraying: boolean): string {
  const base = `Hoạt động ${label}.`
  return isSpraying ? `${base} Nhớ ghi số ngày cách ly của thuốc.` : base
}

/** A care plan: the disease and the officer's advice (or that there is none yet). */
export function carePlanSentence(disease: string, officerAdvice: string | null | undefined): string {
  const advice = officerAdvice?.trim() ? officerAdvice.trim() : 'Chưa có hướng dẫn từ cán bộ kỹ thuật.'
  return `Kế hoạch chăm sóc cho ${disease}. ${advice}`
}

/** The member's balance, as the ledger page writes it. */
export function balanceSentence(balanceLine: string): string {
  return `Sổ tiền của bạn: ${balanceLine}.`
}
