// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024

export type CertificateMime = 'application/pdf' | 'image/jpeg' | 'image/png'

const SIGNATURES: [CertificateMime, number[]][] = [
  ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
]

/** The type the first bytes prove, or null when they are not a PDF/JPEG/PNG or disagree with the declared type. */
export function checkCertificateFile(bytes: Uint8Array, declaredMime: string): CertificateMime | null {
  const found = SIGNATURES.find(([, sig]) => sig.every((b, i) => bytes[i] === b))
  return found && found[0] === declaredMime ? found[0] : null
}

/** A storage-safe file name: only [A-Za-z0-9._-], at most 80 characters, no path steps. */
export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 80)
}

/** An upload the server refuses; the route answers 400 with this code. */
export class FileRejectedError extends Error {
  constructor(readonly code: 'FILE_TOO_LARGE' | 'FILE_TYPE', message: string) {
    super(message)
    this.name = 'FileRejectedError'
  }
}
