// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export function isPublicResourcePath(pathname: string): boolean {
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return false
  }
  // Normalize: strip trailing slash, NFC, lower-case via i flag
  const normalized = pathname.replace(/\/+$/, '')
  if (!normalized || normalized.length > 200) return false
  return /^\/(?:lot|htx|q)\/[^/]+$/i.test(normalized)
}

export function isPublicApiPath(pathname: string): boolean {
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return false
  }
  const normalized = pathname.split('?')[0].replace(/\/+$/, '')
  if (!normalized || normalized.length > 300) return false
  return /^\/api\/lot\/[^/]+\/certificate$/i.test(normalized)
}
