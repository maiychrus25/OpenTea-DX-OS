// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * Text folded for matching (contract C8): lower case, marks removed, `đ` as `d`, every other non-letter or non-digit a
 * space, spaces collapsed, then one space on each side so a phrase matches as ` phrase `.
 */
export function normalizeText(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return ` ${folded} `
}
