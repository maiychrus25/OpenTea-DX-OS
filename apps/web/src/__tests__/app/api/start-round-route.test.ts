/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { POST } from '@/app/api/parcels/[id]/start-round/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = {
    parcel: { updateMany: jest.fn() },
    parcelCropCycle: { findMany: jest.fn(), create: jest.fn() },
  }
  return {
    prisma: {
      __tx: tx,
      htxProfile: { findUnique: jest.fn() },
      parcel: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})

const db = prisma as any
const tx = db.__tx
const mock = (fn: unknown) => fn as jest.Mock
const call = () => POST(new Request('http://localhost/api/parcels/p1/start-round', { method: 'POST' }), { params: Promise.resolve({ id: 'p1' }) })
const signIn = (role: string, htxCode: string | null = 'TC') => mock(auth).mockResolvedValue({ user: { id: 'u1', role, htxCode, name: 'U' } })

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-11-10T03:00:00Z'))
  db.htxProfile.findUnique.mockResolvedValue({ id: 'htx-tc', htx_code: 'TC', name: 'HTX TC', crop_types: [] })
  db.parcel.findUnique.mockResolvedValue({ household: { htx_profile_id: 'htx-tc' } })
  tx.parcel.updateMany.mockResolvedValue({ count: 1 })
  tx.parcelCropCycle.findMany.mockResolvedValue([])
  tx.parcelCropCycle.create.mockResolvedValue({ id: 'c9' })
})
afterEach(() => jest.useRealTimers())

describe('POST /api/parcels/[id]/start-round', () => {
  test('an officer starts the next round', async () => {
    signIn('officer')
    const response = await call()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { cycleId: 'c9', season: 'Lứa 1/2026' } })
    expect(tx.parcel.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', status: 'HARVESTED' }, data: { status: 'TENDING' } })
  })

  test.each(['farmer', 'manager'])('a %s gets 403 and nothing is written', async (role) => {
    signIn(role)
    expect((await call()).status).toBe(403)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  test('anonymous gets 401', async () => {
    mock(auth).mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  test('a user without an HTX gets NO_HTX', async () => {
    signIn('officer', null)
    const response = await call()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  test('a parcel that is not harvested is refused without a new cycle', async () => {
    signIn('officer')
    tx.parcel.updateMany.mockResolvedValue({ count: 0 })
    const response = await call()
    expect(response.status).toBe(422)
    expect((await response.json()).error.message).toBe('Chỉ bắt đầu lứa mới khi thửa đã thu hoạch')
    expect(tx.parcelCropCycle.create).not.toHaveBeenCalled()
  })
})
