// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Resolve public base URL for QR generation.
 * Priority: explicit env var > validated Host header > fallback localhost:3000.
 * Validates host to prevent Host header injection (Blind #1, E02).
 */
export function resolveBaseUrlFromHeaders(
  headers: { get(name: string): string | null },
  envBaseUrl?: string
): string {
  const envUrl = envBaseUrl || process.env.NEXT_PUBLIC_BASE_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')

  const rawHost = headers.get('host')
  const rawProto = headers.get('x-forwarded-proto')

  // x-forwarded-proto may be "https, http" — take first token
  const proto = rawProto ? rawProto.split(',')[0].trim().toLowerCase() : null
  const protocol = proto === 'http' || proto === 'https' ? proto : rawHost?.includes('localhost') ? 'http' : 'https'

  if (rawHost && isValidHost(rawHost)) {
    return `${protocol}://${rawHost.replace(/\/+$/, '')}`
  }
  return 'http://localhost:3000'
}

export function isValidHost(host: string): boolean {
  // Allow hostname + optional port, no userinfo, no path, no CRLF
  // Reject hosts containing @, /, \, ?, #, %, space, or newline
  if (!host || host.length > 253) return false
  if (/[\r\n@\s\/\\?#%]/.test(host)) return false
  // Basic pattern: labels separated by dots, optional :port
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host)
}

export function normalizeLotCode(code: string): string {
  // NFC normalize to handle CHÈ vs CHÈ (precomposed vs decomposed), trim, limit length
  try {
    return code.normalize('NFC').trim()
  } catch {
    return code.trim()
  }
}

export function isValidLotCode(code: string): boolean {
  // lot_code max 30 chars per rules-and-limits §3.1, min 3
  if (!code || code.length < 3 || code.length > 100) return false
  // Disallow path separators and control chars after decode
  if (/[\/\r\n?#]/.test(code)) return false
  return true
}
