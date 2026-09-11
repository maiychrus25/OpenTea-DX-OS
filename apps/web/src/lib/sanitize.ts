// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Escapes unsafe HTML characters to prevent XSS vulnerabilities
 * when embedding dynamic text content into raw HTML templates or Leaflet popups.
 */
export function escapeHtml(unsafe: string | number | null | undefined): string {
  if (unsafe == null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
