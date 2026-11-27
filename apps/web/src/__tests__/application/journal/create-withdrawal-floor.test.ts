/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import type { CreateJournalData, JournalPort } from '@/domain/journal/ports/JournalPort'
import type { PesticidePort } from '@/domain/pesticide/ports/PesticidePort'
import { WithdrawalBelowFloorError } from '@/domain/errors'

const stored: CreateJournalData[] = []
const journalPort = {
  create: jest.fn(async (data: CreateJournalData) => {
    stored.push(data)
    return { id: 'e1' }
  }),
  findByClientId: jest.fn(),
} as unknown as JournalPort
const parcelPort = { findById: jest.fn(async () => ({ id: 'p1', household_id: 'hh1' })) }
const CATEX = { productId: 'catex', floorDays: 14 }
const pesticides: PesticidePort = {
  floorFor: jest.fn(async (id: string) => (id === 'catex' ? CATEX : null)),
  matchByTradeName: jest.fn(async (name: string) => (name.trim().toLowerCase() === 'catex 3.6ec' ? 'catex' : null)),
  list: jest.fn(),
  setLabel: jest.fn(),
  clearLabel: jest.fn(),
}

jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => ({ parcel: jest.fn() })) }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn(() => journalPort) }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn(() => parcelPort) }))
jest.mock('@/infrastructure/db/pesticide/PrismaPesticideRepository', () => ({ PrismaPesticideRepository: jest.fn(() => pesticides) }))

const base = (role: 'FARMER' | 'OFFICER', activity: Record<string, unknown>): CreateJournalData => ({
  parcel_id: 'p1',
  entry_date: new Date('2026-11-28T00:00:00Z'),
  activity_type: 'SPRAYING',
  performed_by: 'U',
  submitted_by_id: 'u1',
  submitted_role: role,
  activities: [{ activity_type: 'SPRAYING', ...activity }],
})

const useCase = () => new CreateJournalEntryUseCase(journalPort, parcelPort as never, pesticides)
const lastDays = () => stored[stored.length - 1].activities[0].withdrawal_days

beforeEach(() => {
  stored.length = 0
  jest.clearAllMocks()
})

describe('create rejects or fills withdrawal below floor on every channel', () => {
  it('web farmer: below the floor is rejected, a blank is filled', async () => {
    await expect(
      useCase().execute(base('FARMER', { pesticide_product_id: 'catex', withdrawal_days: 7 }), 'FARMER', 'hh1', 'htx')
    ).rejects.toBeInstanceOf(WithdrawalBelowFloorError)
    expect(stored).toHaveLength(0)

    await useCase().execute(base('FARMER', { pesticide_product_id: 'catex' }), 'FARMER', 'hh1', 'htx')
    expect(lastDays()).toBe(14)
    expect(stored[0].activities[0].pesticide_product_id).toBe('catex')
  })

  it('web officer: the same rule applies', async () => {
    await expect(
      useCase().execute(base('OFFICER', { pesticide_product_id: 'catex', withdrawal_days: 3 }), 'OFFICER', undefined, 'htx')
    ).rejects.toThrow('Thời gian cách ly không được thấp hơn 14 ngày')
    await useCase().execute(base('OFFICER', { pesticide_product_id: 'catex' }), 'OFFICER', undefined, 'htx')
    expect(lastDays()).toBe(14)
  })

  it('telegram action: matches the trade name, rejects below the floor and fills a blank', async () => {
    const action = CHAT_ACTIONS.find((a) => a.name === 'journal.create')!
    const user = {
      tenant: { userId: 'u1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx' },
      userName: 'U',
      householdId: 'hh1',
      telegramUserId: '1',
      chatId: 1,
    }
    const run = (payload: Record<string, unknown>) =>
      action.execute({ parcel_id: 'p1', activity_type: 'SPRAYING', ...payload } as never, user as never, {} as never, new Date('2026-11-28T03:00:00Z'))

    await expect(run({ product_name: ' Catex 3.6EC ', withdrawal_days: 7 })).rejects.toThrow('không được thấp hơn 14 ngày')
    expect(stored).toHaveLength(0)

    await run({ product_name: ' Catex 3.6EC ', withdrawal_days: 14 })
    expect(stored[0].activities[0]).toMatchObject({ pesticide_product_id: 'catex', withdrawal_days: 14 })
  })

  it('a SPRAYING with no product uses the custom floor and is never stored blank or zero', async () => {
    await useCase().execute(base('FARMER', {}), 'FARMER', 'hh1', 'htx')
    expect(lastDays()).toBe(14)
    await expect(useCase().execute(base('FARMER', { withdrawal_days: 0 }), 'FARMER', 'hh1', 'htx')).rejects.toBeInstanceOf(
      WithdrawalBelowFloorError
    )
    await expect(
      useCase().execute(base('OFFICER', { product_name: 'Thuốc lạ', withdrawal_days: 9 }), 'OFFICER', undefined, 'htx')
    ).rejects.toBeInstanceOf(WithdrawalBelowFloorError)
    expect(stored.every((d) => (d.activities[0].withdrawal_days ?? 0) >= 14)).toBe(true)
  })

  it('leaves other activities alone', async () => {
    await useCase().execute(base('FARMER', { activity_type: 'FERTILIZING' }), 'FARMER', 'hh1', 'htx')
    expect(lastDays()).toBeUndefined()
  })

  it('rejects an unknown catalogue id instead of storing a broken link', async () => {
    await expect(
      useCase().execute(base('FARMER', { pesticide_product_id: 'nope' }), 'FARMER', 'hh1', 'htx')
    ).rejects.toThrow('Không tìm thấy thuốc trong danh mục')
  })
})
