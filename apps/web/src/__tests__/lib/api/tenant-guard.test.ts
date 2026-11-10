/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { PrismaClient } from '@prisma/client'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { NotFoundError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))

const tenant: Tenant = { userId: 'u1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' }
const via = (htx: string | null) => ({ household: { htx_profile_id: htx } })
const viaParcel = (htx: string | null) => ({ parcel: via(htx) })

type Method = 'parcel' | 'household' | 'lot' | 'journalEntry' | 'diseaseReport' | 'cropCycle'
// model the method reads, and the record shape that links it to an HTX
const cases: [Method, string, (htx: string | null) => unknown][] = [
  ['parcel', 'parcel', via],
  ['household', 'household', (htx) => ({ htx_profile_id: htx })],
  ['lot', 'lot', (htx) => ({ htx_profile_id: htx })],
  ['journalEntry', 'journalEntry', viaParcel],
  ['diseaseReport', 'diseaseReport', via],
  ['cropCycle', 'parcelCropCycle', viaParcel],
]

function guardWith(model: string, record: unknown) {
  const findUnique = jest.fn().mockResolvedValue(record)
  const db = { [model]: { findUnique } } as unknown as PrismaClient
  return { guard: new TenantGuard(tenant, db), findUnique }
}

describe.each(cases)('TenantGuard.%s', (method, model, shape) => {
  test(`${method} passes for the caller HTX`, async () => {
    const { guard } = guardWith(model, shape('htx-tc'))
    await expect(guard[method]('r1')).resolves.toBeUndefined()
  })

  test(`${method} throws NotFoundError for another HTX`, async () => {
    const { guard } = guardWith(model, shape('htx-lb'))
    await expect(guard[method]('r1')).rejects.toBeInstanceOf(NotFoundError)
  })

  test(`${method} throws NotFoundError for a missing record`, async () => {
    const { guard } = guardWith(model, null)
    await expect(guard[method]('r1')).rejects.toBeInstanceOf(NotFoundError)
  })

  test(`${method} throws NotFoundError when the HTX link is null`, async () => {
    const { guard } = guardWith(model, shape(null))
    await expect(guard[method]('r1')).rejects.toBeInstanceOf(NotFoundError)
  })
})
