// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NotFoundError, ValidationError } from '@/domain/errors'

// Object keys are flat, so an encoded or relative step is refused rather than resolved.
const UNSAFE = /[\\\0]|%2e|%2f|%5c/i

/** Written by workflows/vietnam_market_sync.json. It holds no tenant data, so every HTX may read it and none may write. */
export const MARKET_REPORTS_ROOT = 'para/Archives/Market_Reports/'

function hasSafeSegments(key: string): boolean {
  if (UNSAFE.test(key)) return false
  return !key.replace(/\/$/, '').split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

/** The folder that holds every document of one HTX. */
export function documentRoot(htxCode: string): string {
  return `para/${htxCode}/`
}

/** True when a key or folder sits inside the document tree of the HTX. */
export function isInDocumentRoot(key: string, htxCode: string): boolean {
  return `${key.replace(/\/$/, '')}/`.startsWith(documentRoot(htxCode)) && hasSafeSegments(key)
}

/** A key outside the namespace answers 404, so keys of other HTXs are not revealed. */
export function assertInDocumentRoot(key: string, htxCode: string): void {
  if (!isInDocumentRoot(key, htxCode)) throw new NotFoundError('Document not found')
}

/** Read routes only: the document tree of the HTX, or the shared market reports. */
export function assertReadableDocument(key: string, htxCode: string): void {
  if (!isInDocumentRoot(key, htxCode) && !(key.startsWith(MARKET_REPORTS_ROOT) && hasSafeSegments(key))) {
    throw new NotFoundError('Document not found')
  }
}

export function assertJournalPhotoKey(key: string | undefined, htxCode: string): void {
  if (key !== undefined && !isInDocumentRoot(key, htxCode)) {
    throw new ValidationError('photo_minio_key must belong to your HTX')
  }
}

export function assertCertificateKeys(keys: string[] | undefined, htxCode: string): void {
  if (keys?.some((key) => !isInDocumentRoot(key, htxCode))) {
    throw new ValidationError('certificate_keys must belong to your HTX')
  }
}
