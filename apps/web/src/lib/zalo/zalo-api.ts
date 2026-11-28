// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * Calls a Zalo route and returns its `data`. A failed call throws without the server's message: its
 * validation text can be English, so each screen shows its own Vietnamese line instead.
 */
export async function zaloCall<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return ((await res.json()) as { data: T }).data
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Vietnam time for a stored ISO instant, e.g. 28/11/2026, 10:00:00. */
export const formatVn = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
