// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateInputAdvanceUseCase } from '@/application/ledger/CreateInputAdvanceUseCase'
import { VoidInputAdvanceUseCase } from '@/application/ledger/VoidInputAdvanceUseCase'
import { ManageInputItemsUseCase } from '@/application/ledger/ManageInputItemsUseCase'
import { advanceAmount } from '@/domain/ledger/advance-math'
import { FakeInputPort, NOW, accountant, manager } from '../../../../__tests__/__mocks__/ledger-fakes'

const farmer = { ...accountant, userId: 'f-1', role: 'farmer' }
const officer = { ...accountant, userId: 'o-1', role: 'officer' }
const input = { household_id: 'hh-1', item_id: 'item-1', quantity: 2 }

describe('advanceAmount', () => {
  it('is exact integer VND, rounded half up', () => {
    expect(advanceAmount(2, 450000)).toBe(BigInt(900000))
    expect(advanceAmount(0.5, 15001)).toBe(BigInt(7501)) // 7500.5
    expect(advanceAmount(1.25, 80000)).toBe(BigInt(100000))
    expect(advanceAmount(0.01, 49)).toBe(BigInt(0)) // 0.49
    expect(advanceAmount(100000, 100_000_000)).toBe(BigInt('10000000000000'))
  })
})

describe('CreateInputAdvanceUseCase', () => {
  let port: FakeInputPort
  let useCase: CreateInputAdvanceUseCase
  beforeEach(() => {
    port = new FakeInputPort()
    useCase = new CreateInputAdvanceUseCase(port, () => NOW)
  })

  it('copies the item price, computes the amount and numbers the advance', async () => {
    const { advance, created } = await useCase.execute(accountant, input)
    expect(created).toBe(true)
    expect(advance).toMatchObject({ advance_no: 'TC-VT-20261128-001', unit_price_vnd: 450000, amount_vnd: '900000', advanced_on: '2026-11-28', status: 'VALID' })
  })

  it('keeps the copied price when the item price changes later', async () => {
    const { advance } = await useCase.execute(accountant, input)
    await port.updateItem('htx-tc', 'item-1', { unit_price_vnd: 999999 })
    expect(port.advances[0]).toBe(advance)
    expect(advance.unit_price_vnd).toBe(450000)
  })

  it('numbers two parallel advances differently', async () => {
    const [a, b] = await Promise.all([useCase.execute(accountant, input), useCase.execute(accountant, input)])
    expect(new Set([a.advance.advance_no, b.advance.advance_no]).size).toBe(2)
  })

  it('lets a manager enter an advance but not a farmer or an officer', async () => {
    expect((await useCase.execute(manager, input)).created).toBe(true)
    await expect(useCase.execute(farmer, input)).rejects.toThrow('Forbidden')
    await expect(useCase.execute(officer, input)).rejects.toThrow('Forbidden')
    expect(port.advances).toHaveLength(1)
  })

  it('answers not found for a household or item of another HTX', async () => {
    await expect(useCase.execute({ ...accountant, htxProfileId: 'htx-other' }, input)).rejects.toThrow('Không tìm thấy')
    await expect(useCase.execute(accountant, { ...input, item_id: 'nope' })).rejects.toThrow('Không tìm thấy')
    expect(port.advances).toHaveLength(0)
  })

  it('refuses a hidden item, a free item and a day in the future', async () => {
    await port.updateItem('htx-tc', 'item-1', { active: false })
    await expect(useCase.execute(accountant, input)).rejects.toThrow('đã ẩn')
    await port.updateItem('htx-tc', 'item-1', { active: true, unit_price_vnd: 0 })
    await expect(useCase.execute(accountant, input)).rejects.toThrow('đơn giá')
    await port.updateItem('htx-tc', 'item-1', { unit_price_vnd: 1000 })
    await expect(useCase.execute(accountant, { ...input, advanced_on: '2026-11-29' })).rejects.toThrow('tương lai')
    expect((await useCase.execute(accountant, { ...input, advanced_on: '2026-11-20' })).advance.advanced_on).toBe('2026-11-20')
  })

  it('returns the first advance for a replayed client_id', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const first = await useCase.execute(accountant, { ...input, client_id: id })
    const again = await useCase.execute(accountant, { ...input, client_id: id })
    expect(again.created).toBe(false)
    expect(again.advance.id).toBe(first.advance.id)
    expect(port.advances).toHaveLength(1)
  })

  it('hands back the first advance when two replays race past the check', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const first = await useCase.execute(accountant, { ...input, client_id: id })
    jest.spyOn(port, 'findAdvanceByClientId').mockResolvedValueOnce(null).mockResolvedValue(first.advance)
    jest.spyOn(port, 'inAdvanceTransaction').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
    const again = await useCase.execute(accountant, { ...input, client_id: id })
    expect(again).toEqual({ advance: first.advance, created: false })
  })
})

describe('VoidInputAdvanceUseCase', () => {
  const run = (port: FakeInputPort, actor = accountant) => new VoidInputAdvanceUseCase(port, () => NOW).execute(actor, 'adv-1', 'Nhập nhầm')

  it('voids an unsettled advance', async () => {
    const port = new FakeInputPort()
    const advance = { id: 'adv-1' } as never
    port.voidOutcome = { kind: 'voided', advance }
    expect(await run(port)).toBe(advance)
  })

  it('answers 409 ADVANCE_SETTLED for a settled advance', async () => {
    const port = new FakeInputPort()
    port.voidOutcome = { kind: 'settled' }
    await expect(run(port)).rejects.toMatchObject({ code: 'ADVANCE_SETTLED' })
  })

  it('answers 409 for a second void, 404 for an unknown id and 403 for a farmer', async () => {
    const port = new FakeInputPort()
    port.voidOutcome = { kind: 'already_voided' }
    await expect(run(port)).rejects.toMatchObject({ code: 'ADVANCE_VOIDED' })
    port.voidOutcome = { kind: 'not_found' }
    await expect(run(port)).rejects.toThrow('Không tìm thấy')
    await expect(run(port, farmer as never)).rejects.toThrow('Forbidden')
  })
})

describe('ManageInputItemsUseCase', () => {
  let port: FakeInputPort
  let useCase: ManageInputItemsUseCase
  beforeEach(() => {
    port = new FakeInputPort()
    useCase = new ManageInputItemsUseCase(port)
  })
  const fertilizer = { name: 'Phân hữu cơ', unit: 'bao', unit_price_vnd: 120000, kind: 'FERTILIZER' as const }

  it('lists for staff and the officer, not for a farmer', async () => {
    expect(await useCase.list(officer)).toHaveLength(2)
    await expect(useCase.list(farmer as never)).rejects.toThrow('Forbidden')
  })

  it('creates an item for a manager or accountant only', async () => {
    expect(await useCase.create(accountant, fertilizer)).toMatchObject({ name: 'Phân hữu cơ', pesticide_product_id: null, active: true })
    await expect(useCase.create(officer, fertilizer)).rejects.toThrow('Forbidden')
  })

  it('links a PESTICIDE item only to a catalogue product and refuses a link on other kinds', async () => {
    await expect(useCase.create(accountant, { ...fertilizer, name: 'Thuốc', kind: 'PESTICIDE', pesticide_product_id: 'unknown' })).rejects.toThrow('thuốc')
    await expect(useCase.create(accountant, { ...fertilizer, pesticide_product_id: 'catex' })).rejects.toThrow('thuốc')
    expect((await useCase.create(accountant, { ...fertilizer, name: 'Thuốc', kind: 'PESTICIDE', pesticide_product_id: 'catex' })).pesticide_product_id).toBe('catex')
  })

  it('refuses a name that exists', async () => {
    await expect(useCase.create(accountant, { ...fertilizer, name: 'Phân NPK' })).rejects.toMatchObject({ code: 'ITEM_EXISTS' })
  })

  it('updates partly and checks the merged kind and link', async () => {
    expect(await useCase.update(accountant, 'item-1', { unit_price_vnd: 500000 })).toMatchObject({ unit_price_vnd: 500000, name: 'Phân NPK' })
    await expect(useCase.update(accountant, 'item-2', { kind: 'OTHER' })).rejects.toThrow('thuốc')
    await expect(useCase.update(accountant, 'nope', { active: false })).rejects.toThrow('Không tìm thấy')
    await expect(useCase.update(accountant, 'item-1', { name: 'Catex 3.6EC' })).rejects.toMatchObject({ code: 'ITEM_EXISTS' })
  })
})
