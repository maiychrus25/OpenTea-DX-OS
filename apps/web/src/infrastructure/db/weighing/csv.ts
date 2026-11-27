// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** A cell that starts like a formula gets a leading quote, so a spreadsheet shows it as text instead of running it. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
