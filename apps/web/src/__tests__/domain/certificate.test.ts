/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { certificateStatus } from '@/domain/certificate/status'
import { CERTIFICATE_MAX_BYTES, checkCertificateFile, safeFileName } from '@/domain/certificate/file-check'

describe('certificateStatus', () => {
  const base = { revoked_at: null, expires_on: '2026-12-01' }
  it('is VALID on the expiry day and EXPIRED the day after', () => {
    expect(certificateStatus(base, '2026-12-01')).toBe('VALID')
    expect(certificateStatus(base, '2026-12-02')).toBe('EXPIRED')
  })
  it('lets revoked win over expired and valid', () => {
    expect(certificateStatus({ ...base, revoked_at: new Date() }, '2026-11-01')).toBe('REVOKED')
    expect(certificateStatus({ ...base, revoked_at: new Date() }, '2027-01-01')).toBe('REVOKED')
  })
})

describe('checkCertificateFile', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2])
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
  it('accepts pdf, jpeg and png by their first bytes', () => {
    expect(checkCertificateFile(pdf, 'application/pdf')).toBe('application/pdf')
    expect(checkCertificateFile(jpeg, 'image/jpeg')).toBe('image/jpeg')
    expect(checkCertificateFile(png, 'image/png')).toBe('image/png')
  })
  it('refuses html named pdf, and a declared type that disagrees with the bytes', () => {
    const html = new TextEncoder().encode('<html><body>x</body></html>')
    expect(checkCertificateFile(html, 'application/pdf')).toBeNull()
    expect(checkCertificateFile(png, 'application/pdf')).toBeNull()
    expect(checkCertificateFile(new Uint8Array([]), 'image/png')).toBeNull()
  })
  it('limits the size to 10 MB', () => {
    expect(CERTIFICATE_MAX_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe('safeFileName', () => {
  it('keeps [A-Za-z0-9._-], at most 80 characters', () => {
    expect(safeFileName('Giấy VietGAP (2026).pdf')).toBe('Gi_y_VietGAP__2026_.pdf')
    expect(safeFileName('a'.repeat(200) + '.pdf')).toHaveLength(80)
    expect(safeFileName('../../x')).not.toContain('/')
  })
})
