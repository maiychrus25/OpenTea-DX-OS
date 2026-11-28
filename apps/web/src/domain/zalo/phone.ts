// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** A Vietnamese mobile number in the international form Zalo wants (`84` plus nine digits), or null. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '').replace(/^\+/, '')
  if (!/^\d+$/.test(digits)) return null
  const international = digits.startsWith('84') ? digits : digits.startsWith('0') ? `84${digits.slice(1)}` : digits
  return /^84\d{9}$/.test(international) ? international : null
}

/** Only the last three digits, for lists and logs. */
export const maskPhone = (phone: string): string => `***${phone.slice(-3)}`
