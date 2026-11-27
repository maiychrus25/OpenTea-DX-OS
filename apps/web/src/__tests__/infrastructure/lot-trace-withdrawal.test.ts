// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { lot: { findUnique: jest.fn() } } }))

test('the lot trace leaves drafts and rejected entries out of the withdrawal check', async () => {
  const findUnique = prisma.lot.findUnique as jest.Mock
  findUnique.mockResolvedValue(null)
  await new PrismaLotTraceRepository().getLotByCode('TC-1')
  const entries = findUnique.mock.calls[0][0].include.lot_parcels.include.parcel.include.journal_entries
  expect(entries.where.status).toEqual({ notIn: ['DRAFT', 'REJECTED'] })
})
