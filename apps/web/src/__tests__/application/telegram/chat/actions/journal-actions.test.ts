/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import type { ChatAction, ChatUser, ChoiceStep } from '@/application/telegram/chat/types'
import { DomainError } from '@/domain/errors'

const mockFakes = { findAll: jest.fn(), scoped: jest.fn(), update: jest.fn(), remove: jest.fn() }

jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({
  PrismaJournalRepository: jest.fn(() => ({
    findAll: (...a: unknown[]) => mockFakes.findAll(...a),
    findManyScoped: (...a: unknown[]) => mockFakes.scoped(...a),
  })),
}))
jest.mock('@/application/journal/UpdateJournalEntryUseCase', () => ({
  UpdateJournalEntryUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.update(...a) })),
}))
jest.mock('@/application/journal/DeleteJournalEntryUseCase', () => ({
  DeleteJournalEntryUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.remove(...a) })),
}))

const farmer: ChatUser = {
  tenant: { userId: 'farmer-1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Nguyen Van A',
  householdId: 'hh1',
  telegramUserId: '1001',
  chatId: 1001,
}
const deps = { photos: { put: jest.fn(), get: jest.fn(), delete: jest.fn() } }
const NOW = new Date('2026-11-27T03:00:00.000Z')
const entry = (id: string, status: string, household = 'hh1') => ({
  id,
  household_id: household,
  parcel_code: `TC-${id}`,
  activity_type: 'SPRAYING',
  status,
  entry_date: new Date('2026-11-25T00:00:00Z'),
})

const action = (name: string): ChatAction => {
  const found = CHAT_ACTIONS.find((a) => a.name === name)
  if (!found) throw new Error(`no action ${name}`)
  return found
}
const choicesOf = (a: ChatAction, slot: string, state = {}) => (a.steps.find((s) => s.slot === slot) as ChoiceStep).choices(farmer, state)

beforeEach(() => {
  for (const fake of Object.values(mockFakes)) fake.mockReset()
  mockFakes.scoped.mockImplementation(async (ids: string[]) => ids.map((id) => entry(id, 'PENDING_APPROVAL')))
  mockFakes.update.mockResolvedValue({})
  mockFakes.remove.mockResolvedValue(undefined)
})

describe('journal.edit', () => {
  const a = () => action('journal.edit')

  it('is a medium action for farmers', () => {
    expect([a().risk, [...a().roles], a().consequenceVi]).toEqual(['medium', ['farmer'], null])
    expect(a().routes).toEqual(['PUT /api/journal/[id]'])
  })

  it('offers only the own household entries that can still change, up to eight', async () => {
    mockFakes.findAll.mockResolvedValue({
      entries: [
        ...Array.from({ length: 9 }, (_, i) => entry(`e${i}`, 'PENDING_APPROVAL')),
        entry('done', 'APPROVED'),
        entry('other', 'PENDING_APPROVAL', 'hh2'),
      ],
      total: 11,
    })
    const choices = await choicesOf(a(), 'entry_id')
    expect(mockFakes.findAll).toHaveBeenCalledWith(expect.objectContaining({ household_id: 'hh1', htx_profile_id: 'htx-tc' }))
    expect(choices.map((c) => c.value)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'])
  })

  it('offers nothing to a farmer without a household', async () => {
    expect(await (a().steps[0] as ChoiceStep).choices({ ...farmer, householdId: null }, {})).toEqual([])
    expect(mockFakes.findAll).not.toHaveBeenCalled()
  })

  it('offers the note and the date, the fields the route stores', async () => {
    expect((await choicesOf(a(), 'field')).map((c) => c.value)).toEqual(['observation', 'entry_date'])
  })

  it('refuses a date that is not a real day', () => {
    const parse = (value: string) => a().payloadSchema.safeParse({ entry_id: 'e1', field: 'entry_date', value }).success
    expect(parse('25/11/2026')).toBe(true)
    expect(parse('31/02/2026')).toBe(false)
    expect(parse('hôm qua')).toBe(false)
  })

  it('shows the entry, the field and the new value', async () => {
    const lines = await a().preview({ entry_id: 'e1', field: 'observation', value: 'Đã tưới' }, farmer)
    expect(lines).toEqual(['Nhật ký: 25/11 · TC-e1 · Phun thuốc', 'Trường: Ghi chú', 'Giá trị mới: Đã tưới'])
  })

  it('updates the note through UpdateJournalEntryUseCase as the farmer of the household', async () => {
    const result = await a().execute({ entry_id: 'e1', field: 'observation', value: 'Đã tưới' }, farmer, deps, NOW)
    expect(mockFakes.scoped).toHaveBeenCalledWith(['e1'], 'htx-tc')
    expect(mockFakes.update).toHaveBeenCalledWith('e1', { observation: 'Đã tưới' }, 'FARMER', 'hh1', 'htx-tc')
    expect(result).toBe('Đã cập nhật nhật ký.')
  })

  it('updates the date as a date', async () => {
    await a().execute({ entry_id: 'e1', field: 'entry_date', value: '25/11/2026' }, farmer, deps, NOW)
    expect(mockFakes.update).toHaveBeenCalledWith('e1', { entry_date: new Date('2026-11-25T00:00:00.000Z') }, 'FARMER', 'hh1', 'htx-tc')
  })

  it('answers not found for an entry of another cooperative and writes nothing (Review Focus 1)', async () => {
    mockFakes.scoped.mockResolvedValue([])
    await expect(a().execute({ entry_id: 'x', field: 'observation', value: 'v' }, farmer, deps, NOW)).rejects.toThrow(DomainError)
    expect(mockFakes.update).not.toHaveBeenCalled()
  })

  it('answers not found for an entry of another household (Review Focus 1)', async () => {
    mockFakes.scoped.mockResolvedValue([entry('x', 'PENDING_APPROVAL', 'hh2')])
    await expect(a().execute({ entry_id: 'x', field: 'observation', value: 'v' }, farmer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.update).not.toHaveBeenCalled()
  })
})

describe('journal.delete', () => {
  const a = () => action('journal.delete')

  it('is a high action with a second-card consequence', () => {
    expect([a().risk, [...a().roles]]).toEqual(['high', ['farmer']])
    expect(a().consequenceVi).toBe('Nhật ký sẽ bị rút lại và xoá. Không thể khôi phục.')
    expect(a().routes).toEqual(['DELETE /api/journal/[id]'])
  })

  it('offers only entries that can still be withdrawn', async () => {
    mockFakes.findAll.mockResolvedValue({
      entries: [entry('a', 'PENDING_APPROVAL'), entry('b', 'REJECTED'), entry('c', 'DRAFT')],
      total: 3,
    })
    expect((await choicesOf(a(), 'entry_id')).map((c) => c.value)).toEqual(['a', 'c'])
  })

  it('names the entry on the card', async () => {
    expect(await a().preview({ entry_id: 'e1' }, farmer)).toEqual(['Nhật ký: 25/11 · TC-e1 · Phun thuốc'])
  })

  it('deletes through DeleteJournalEntryUseCase as the farmer of the household', async () => {
    expect(await a().execute({ entry_id: 'e1' }, farmer, deps, NOW)).toBe('Đã rút lại nhật ký.')
    expect(mockFakes.remove).toHaveBeenCalledWith('e1', 'FARMER', 'hh1')
  })

  it('does not touch another household entry (Review Focus 1)', async () => {
    mockFakes.scoped.mockResolvedValue([entry('x', 'PENDING_APPROVAL', 'hh2')])
    await expect(a().execute({ entry_id: 'x' }, farmer, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.remove).not.toHaveBeenCalled()
  })

  it('surfaces the use case refusal of an approved entry', async () => {
    mockFakes.remove.mockRejectedValue(new DomainError('Only draft/pending entries can be deleted'))
    await expect(a().execute({ entry_id: 'e1' }, farmer, deps, NOW)).rejects.toThrow('Only draft/pending')
  })
})
