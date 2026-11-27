/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { htxCertificate: { findMany: jest.fn() } } }))

const d = (day: string) => new Date(`${day}T00:00:00Z`)
const row = (id: string, expires: string, revoked: Date | null = null) => ({
  id, htx_profile_id: 'htx-tc', kind: 'OCOP', number: id, issuer: 'i', issued_on: d('2020-01-01'), expires_on: d(expires),
  scope_note: null, file_key: `k-${id}`, file_name: 'f', file_mime: 'application/pdf', file_size: 1,
  created_by_id: 'u', created_at: new Date(), revoked_at: revoked, revoked_by_id: null, revoke_reason: null,
})

describe('PrismaCertificateRepository.validForLot', () => {
  const rows = [row('ok', '2027-01-01'), row('today', '2026-11-28'), row('old', '2026-11-27'), row('gone', '2027-01-01', new Date())]
  beforeEach(() => (prisma.htxCertificate.findMany as jest.Mock).mockResolvedValue(rows))

  it('without ids returns every certificate valid on the day (expiry day included)', async () => {
    const res = await new PrismaCertificateRepository().validForLot('htx-tc', null, '2026-11-28')
    expect(res.ok?.map((r) => r.id)).toEqual(['ok', 'today'])
  })

  it('with ids names the expired, revoked and foreign ones; foreign ids are not in the HTX query result', async () => {
    const repo = new PrismaCertificateRepository()
    expect(await repo.validForLot('htx-tc', ['ok', 'old', 'gone', 'foreign'], '2026-11-28')).toEqual({ invalid: ['old', 'gone', 'foreign'] })
    const res = await repo.validForLot('htx-tc', ['ok', 'today'], '2026-11-28')
    expect(res.ok?.map((r) => r.id)).toEqual(['ok', 'today'])
    expect(prisma.htxCertificate.findMany).toHaveBeenCalledWith({ where: { htx_profile_id: 'htx-tc', id: { in: ['ok', 'today'] } } })
  })
})
