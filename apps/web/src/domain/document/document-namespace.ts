// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NotFoundError, ValidationError } from '@/domain/errors'

// Object keys are flat, so an encoded or relative step is refused rather than resolved.
const UNSAFE = /[\\\0]|%2e|%2f|%5c/i

/** The folder that holds every document of one HTX. */
export function documentRoot(htxCode: string): string {
  return `para/${htxCode}/`
}

/** True when a key or folder sits inside the document tree of the HTX. */
export function isInDocumentRoot(key: string, htxCode: string): boolean {
  if (UNSAFE.test(key) || !`${key.replace(/\/$/, '')}/`.startsWith(documentRoot(htxCode))) return false
  return !key.replace(/\/$/, '').split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

/** A key outside the namespace answers 404, so keys of other HTXs are not revealed. */
export function assertInDocumentRoot(key: string, htxCode: string): void {
  if (!isInDocumentRoot(key, htxCode)) throw new NotFoundError('Document not found')
}

export function assertCertificateKeys(keys: string[] | undefined, htxCode: string): void {
  if (keys?.some((key) => !isInDocumentRoot(key, htxCode))) {
    throw new ValidationError('certificate_keys must belong to your HTX')
  }
}
