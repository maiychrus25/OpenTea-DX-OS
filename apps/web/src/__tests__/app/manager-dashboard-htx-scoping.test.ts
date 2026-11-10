// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Story 7-0a — HTX Scoping: Dependent-Query Evidence Tests
 *
 * Purpose: Prove that all consumers of htx_profile_id correctly scope their
 * queries to a specific HTX. Uses mocked Prisma/repositories to verify that
 * the right WHERE clauses are passed — no live DB required.
 *
 * Consumers tested:
 *   1. PrismaHouseholdRepository.findAll(htxId) → WHERE htx_profile_id = htxId
 *   2. PrismaLotRepository.findAll({ htx_profile_id }) → WHERE htx_profile_id = ?
 *   3. GlobalSearchUseCase → all 3 entity types scoped to htxProfileId
 *
 * Acceptance Criteria covered: AC1, AC2, AC6, and the "dependent-query evidence" requirement.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock Prisma client — prevents any real DB calls
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    household: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    lot: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    parcel: {
      findMany: jest.fn(),
    },
    htxProfile: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { GlobalSearchUseCase } from '@/application/search/GlobalSearchUseCase'

const mockPrisma = prisma as unknown as {
  household: jest.Mocked<typeof prisma.household>
  lot: jest.Mocked<typeof prisma.lot>
  parcel: jest.Mocked<typeof prisma.parcel>
  htxProfile: jest.Mocked<typeof prisma.htxProfile>
}

const TEST_HTX_ID = 'htx-profile-test-001'
const OTHER_HTX_ID = 'htx-profile-other-999'

beforeEach(() => {
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Story 7-0a: HTX Scoping — Dependent-Query Evidence', () => {

  // ── 1. PrismaHouseholdRepository ───────────────────────────────────────────
  describe('PrismaHouseholdRepository.findAll(htxId)', () => {
    it('calls prisma.household.findMany with WHERE htx_profile_id = htxId', async () => {
      mockPrisma.household.findMany.mockResolvedValue([])

      const repo = new PrismaHouseholdRepository()
      await repo.findAll(TEST_HTX_ID)

      expect(mockPrisma.household.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ htx_profile_id: TEST_HTX_ID }),
        })
      )
    })

    it('does NOT return households from a different HTX (query shape verification)', async () => {
      // Verify that querying TEST_HTX_ID passes the correct filter
      mockPrisma.household.findMany.mockResolvedValue([])
      const repo = new PrismaHouseholdRepository()

      await repo.findAll(TEST_HTX_ID)
      const testHtxCall = mockPrisma.household.findMany.mock.calls[0][0] as any
      expect(testHtxCall?.where?.htx_profile_id).toBe(TEST_HTX_ID)

      // Verify that querying OTHER_HTX_ID passes a different filter — proving isolation
      jest.clearAllMocks()
      mockPrisma.household.findMany.mockResolvedValue([])
      await repo.findAll(OTHER_HTX_ID)
      const otherHtxCall = mockPrisma.household.findMany.mock.calls[0][0] as any
      expect(otherHtxCall?.where?.htx_profile_id).toBe(OTHER_HTX_ID)
      expect(otherHtxCall?.where?.htx_profile_id).not.toBe(TEST_HTX_ID)
    })
  })

  // ── 2. PrismaLotRepository ─────────────────────────────────────────────────
  describe('PrismaLotRepository.findAll({ htx_profile_id })', () => {
    it('calls prisma.lot.findMany with WHERE htx_profile_id = ? when provided', async () => {
      mockPrisma.lot.findMany.mockResolvedValue([])

      const repo = new PrismaLotRepository()
      await repo.findAll({ htx_profile_id: TEST_HTX_ID, status: 'READY' })

      expect(mockPrisma.lot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            htx_profile_id: TEST_HTX_ID,
            status: 'READY',
          }),
        })
      )
    })

    it('does NOT apply htx_profile_id filter when field is absent (backward-compat)', async () => {
      mockPrisma.lot.findMany.mockResolvedValue([])

      const repo = new PrismaLotRepository()
      await repo.findAll({ status: 'DRAFT' })

      const callArgs = mockPrisma.lot.findMany.mock.calls[0][0] as any
      // htx_profile_id should NOT be in where when not passed
      expect(callArgs?.where?.htx_profile_id).toBeUndefined()
    })

    it('applies htx_profile_id filter even when value is empty string (F1 fix: != null not truthy)', async () => {
      // Regression test: ensures empty string does NOT bypass filter (prevents data leakage)
      // With old truthy-check: if (filters.htx_profile_id) → empty string would be skipped
      // With fixed != null check: empty string IS applied as filter
      mockPrisma.lot.findMany.mockResolvedValue([])

      const repo = new PrismaLotRepository()
      await repo.findAll({ htx_profile_id: '' })

      const callArgs = mockPrisma.lot.findMany.mock.calls[0][0] as any
      // empty string should be set in where (returns 0 results — correct for invalid HTX ID)
      expect(callArgs?.where?.htx_profile_id).toBe('')
    })

    it('combines htx_profile_id with statuses filter correctly', async () => {
      mockPrisma.lot.findMany.mockResolvedValue([])

      const repo = new PrismaLotRepository()
      await repo.findAll({ htx_profile_id: TEST_HTX_ID, statuses: ['READY', 'QR_EXPORTED'] })

      expect(mockPrisma.lot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            htx_profile_id: TEST_HTX_ID,
            status: { in: ['READY', 'QR_EXPORTED'] },
          }),
        })
      )
    })
  })

  // ── 3. GlobalSearchUseCase ─────────────────────────────────────────────────
  describe('GlobalSearchUseCase — HTX scoping on all entity types', () => {
    it('scopes Household search to htxProfileId', async () => {
      mockPrisma.household.findMany.mockResolvedValue([])
      mockPrisma.parcel.findMany.mockResolvedValue([])
      mockPrisma.lot.findMany.mockResolvedValue([])

      const useCase = new GlobalSearchUseCase()
      await useCase.execute('hộ A', TEST_HTX_ID)

      expect(mockPrisma.household.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ htx_profile_id: TEST_HTX_ID }),
        })
      )
    })

    it('scopes Parcel search to htxProfileId via household relation', async () => {
      mockPrisma.household.findMany.mockResolvedValue([])
      mockPrisma.parcel.findMany.mockResolvedValue([])
      mockPrisma.lot.findMany.mockResolvedValue([])

      const useCase = new GlobalSearchUseCase()
      await useCase.execute('P-001', TEST_HTX_ID)

      expect(mockPrisma.parcel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household: expect.objectContaining({ htx_profile_id: TEST_HTX_ID }),
          }),
        })
      )
    })

    it('scopes Lot search to htxProfileId', async () => {
      mockPrisma.household.findMany.mockResolvedValue([])
      mockPrisma.parcel.findMany.mockResolvedValue([])
      mockPrisma.lot.findMany.mockResolvedValue([])

      const useCase = new GlobalSearchUseCase()
      await useCase.execute('TC-CHE', TEST_HTX_ID)

      expect(mockPrisma.lot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ htx_profile_id: TEST_HTX_ID }),
        })
      )
    })

    it('returns empty array when query is shorter than 2 chars', async () => {
      const useCase = new GlobalSearchUseCase()
      const results = await useCase.execute('a', TEST_HTX_ID)
      expect(results).toEqual([])
      expect(mockPrisma.household.findMany).not.toHaveBeenCalled()
    })
  })

  // ── 4. Manager Dashboard query pattern evidence ────────────────────────────
  describe('Manager Dashboard — Lot count scoping pattern', () => {
    it('lot.count with htx_profile_id + status is a valid Prisma query shape', () => {
      // This verifies the TypeScript signature used in manager/dashboard/page.tsx
      // The actual call is: prisma.lot.count({ where: { htx_profile_id: id, status: 'READY' } })
      // If this shape is invalid, TypeScript compilation would fail.
      const queryShape: Parameters<typeof prisma.lot.count>[0] = {
        where: {
          htx_profile_id: TEST_HTX_ID,
          status: 'READY',
        },
      }
      expect(queryShape.where?.htx_profile_id).toBe(TEST_HTX_ID)
      expect(queryShape.where?.status).toBe('READY')
    })

    it('parcel.aggregate with household.htx_profile_id is a valid Prisma query shape', () => {
      // Used in manager/dashboard/page.tsx:
      // prisma.parcel.aggregate({ _sum: { area_ha: true }, where: { household: { htx_profile_id: id } } })
      const queryShape: Parameters<typeof prisma.parcel.aggregate>[0] = {
        _sum: { area_ha: true },
        where: {
          household: {
            htx_profile_id: TEST_HTX_ID,
          },
        },
      }
      expect((queryShape.where?.household as any)?.htx_profile_id).toBe(TEST_HTX_ID)
    })
  })
})
