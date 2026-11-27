/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as certs from '@/app/api/certificates/route'
import * as fileRoute from '@/app/api/certificates/[id]/file/route'
import * as revokeRoute from '@/app/api/certificates/[id]/revoke/route'
import { NotFoundError } from '@/domain/errors'
import type { CertificatePort, NewCertificate } from '@/domain/certificate/ports/CertificatePort'
import type { CertificateRow } from '@/domain/certificate/views'
import { certificateStatus } from '@/domain/certificate/status'

class FakeCertificates implements CertificatePort {
  rows: CertificateRow[] = []
  async list(htx: string) { return this.rows.filter((r) => r.htx_profile_id === htx) }
  async find(htx: string, id: string) { return this.rows.find((r) => r.id === id && r.htx_profile_id === htx) ?? null }
  async create(i: NewCertificate) {
    const row: CertificateRow = { id: `c${this.rows.length + 1}`, htx_profile_id: i.htxProfileId, kind: i.kind, number: i.number, issuer: i.issuer,
      issued_on: i.issued_on, expires_on: i.expires_on, scope_note: i.scope_note, file_key: i.file_key, file_name: i.file_name,
      file_mime: i.file_mime, file_size: i.file_size, revoked_at: null, revoke_reason: null }
    this.rows.push(row)
    return row
  }
  async revoke(htx: string, id: string, _u: string, reason: string) {
    const row = await this.find(htx, id)
    if (!row || row.revoked_at) return null
    row.revoked_at = new Date(); row.revoke_reason = reason
    return row
  }
  async validForLot(htx: string, ids: string[] | null, today: string) {
    const mine = this.rows.filter((r) => r.htx_profile_id === htx)
    const valid = mine.filter((r) => certificateStatus(r, today) === 'VALID')
    if (!ids) return { ok: valid }
    const bad = ids.filter((id) => !valid.some((r) => r.id === id))
    return bad.length ? { invalid: bad } : { ok: valid }
  }
}

const fake = new FakeCertificates()
const guard = { certificate: jest.fn() }
const storage = { uploadDocument: jest.fn(), generateDownloadUrl: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/certificate/PrismaCertificateRepository', () => ({ PrismaCertificateRepository: jest.fn(() => fake) }))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn(() => storage) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const json = (data: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(data) })
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100)])

function upload(file: { bytes: Buffer; name: string; type: string } | null, over: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const form = new FormData()
  if (file) form.set('file', new File([new Uint8Array(file.bytes)], file.name, { type: file.type }))
  const fields = { kind: 'VIETGAP', number: 'VG-001', issuer: 'Sở NN', issued_on: '2026-01-01', expires_on: '2027-01-01', ...over }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return new Request('http://x', { method: 'POST', body: form, headers })
}

beforeEach(() => {
  jest.clearAllMocks()
  fake.rows = []
  guard.certificate.mockResolvedValue(undefined)
  storage.generateDownloadUrl.mockResolvedValue('https://files.example/signed')
})

describe('POST /api/certificates', () => {
  it('stores the file under the HTX namespace and answers 201 without the file key', async () => {
    signIn('officer')
    const res = await certs.POST(upload({ bytes: PDF, name: 'Giấy VietGAP.pdf', type: 'application/pdf' }, { scope_note: 'Tân Cương' }), {})
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ kind: 'VIETGAP', number: 'VG-001', file_mime: 'application/pdf', file_size: PDF.length, scope_note: 'Tân Cương' })
    expect(data.file_key).toBeUndefined()
    const [key, , mime] = storage.uploadDocument.mock.calls[0]
    expect(key).toMatch(/^para\/TC\/Certificates\/[0-9a-f-]{36}-Gi_y_VietGAP\.pdf$/)
    expect(mime).toBe('application/pdf')
  })

  it('refuses an html file named pdf (400 FILE_TYPE) and stores nothing', async () => {
    signIn('manager')
    const res = await certs.POST(upload({ bytes: Buffer.from('<html></html>'), name: 'x.pdf', type: 'application/pdf' }), {})
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('FILE_TYPE')
    expect(storage.uploadDocument).not.toHaveBeenCalled()
  })

  it('refuses 10 MB + 1 (400 FILE_TOO_LARGE), by content-length first and by size after', async () => {
    signIn('manager')
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 - 4)])
    const bySize = await certs.POST(upload({ bytes: big, name: 'big.pdf', type: 'application/pdf' }), {})
    expect(bySize.status).toBe(400)
    expect((await bySize.json()).error.code).toBe('FILE_TOO_LARGE')
    const byHeader = await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }, {}, { 'content-length': String(50 * 1024 * 1024) }), {})
    expect((await byHeader.json()).error.code).toBe('FILE_TOO_LARGE')
    expect(storage.uploadDocument).not.toHaveBeenCalled()
  })

  it('answers 400 VALIDATION_ERROR for a missing file, a bad field, expiry before issue or an unknown field', async () => {
    signIn('officer')
    for (const req of [
      upload(null),
      upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }, { kind: 'OTHER2' }),
      upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }, { expires_on: '2025-12-31' }),
      upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }, { extra: '1' }),
    ]) {
      const res = await certs.POST(req, {})
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('refuses farmer and accountant, for upload and list', async () => {
    for (const role of ['farmer', 'accountant']) {
      signIn(role)
      expect((await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }), {})).status).toBe(403)
      expect((await certs.GET(new Request('http://x'), {})).status).toBe(403)
    }
  })

  it('lists the certificates of the HTX only, with computed status', async () => {
    signIn('officer')
    await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }, { issued_on: '2020-01-01', expires_on: '2020-12-31' }), {})
    fake.rows.push({ ...fake.rows[0], id: 'other', htx_profile_id: 'htx-other' })
    const { data } = await (await certs.GET(new Request('http://x'), {})).json()
    expect(data).toHaveLength(1)
    expect(data[0].status).toBe('EXPIRED')
  })
})

describe('GET /api/certificates/[id]/file', () => {
  it('redirects 302 to the presigned url valid for 3600 s', async () => {
    signIn('officer')
    const { data } = await (await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }), {})).json()
    const res = await fileRoute.GET(new Request('http://x'), ctx(data.id))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://files.example/signed')
    expect(storage.generateDownloadUrl).toHaveBeenCalledWith(expect.stringMatching(/^para\/TC\/Certificates\//), false, 3600)
  })

  it('answers 404 for a certificate of another HTX and 403 for a farmer', async () => {
    signIn('officer')
    guard.certificate.mockRejectedValue(new NotFoundError('Resource not found'))
    expect((await fileRoute.GET(new Request('http://x'), ctx('other'))).status).toBe(404)
    signIn('farmer')
    expect((await fileRoute.GET(new Request('http://x'), ctx('c1'))).status).toBe(403)
  })
})

describe('POST /api/certificates/[id]/revoke', () => {
  it('lets only a manager revoke; the officer gets 403 and nothing changes', async () => {
    signIn('officer')
    const { data } = await (await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }), {})).json()
    expect((await revokeRoute.POST(json({ reason: 'Hết hạn sớm' }), ctx(data.id))).status).toBe(403)
    expect(fake.rows[0].revoked_at).toBeNull()
  })

  it('revokes once (200 REVOKED) and refuses the second time with 409 CERTIFICATE_REVOKED', async () => {
    signIn('officer')
    const { data } = await (await certs.POST(upload({ bytes: PDF, name: 'a.pdf', type: 'application/pdf' }), {})).json()
    signIn('manager')
    expect((await revokeRoute.POST(json({ reason: 'x' }), ctx(data.id))).status).toBe(400)
    const ok = await revokeRoute.POST(json({ reason: 'Sai số chứng nhận' }), ctx(data.id))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data).toMatchObject({ status: 'REVOKED', revoke_reason: 'Sai số chứng nhận' })
    const again = await revokeRoute.POST(json({ reason: 'Lần hai' }), ctx(data.id))
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('CERTIFICATE_REVOKED')
    expect(fake.rows[0].revoke_reason).toBe('Sai số chứng nhận')
  })

  it('answers 404 for another HTX', async () => {
    signIn('manager')
    guard.certificate.mockRejectedValue(new NotFoundError('Resource not found'))
    expect((await revokeRoute.POST(json({ reason: 'abc' }), ctx('other'))).status).toBe(404)
  })
})
