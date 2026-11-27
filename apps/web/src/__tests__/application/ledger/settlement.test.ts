/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  CloseSettlementPeriodUseCase, CreateLedgerAdjustmentUseCase, CreateSettlementPeriodUseCase, GetSettlementSlipUseCase,
  GetSettlementUseCase, RecordPayoutUseCase,
} from '@/application/ledger/SettlementUseCases'
import { FakeSettlementPort, NOW, manager, staff } from '../../../../__tests__/__mocks__/settlement-fakes'

const farmer = { ...staff, userId: 'farmer-1', role: 'farmer' }
const officer = { ...staff, userId: 'off-1', role: 'officer' }
let port: FakeSettlementPort
const create = (from: string, to: string, actor = staff) => new CreateSettlementPeriodUseCase(port, () => NOW).execute(actor, { date_from: from, date_to: to })
const close = (id: string, count: number, total: string, actor = manager) => new CloseSettlementPeriodUseCase(port, () => NOW).execute(actor, id, { household_count: count, payable_total_vnd: total })
const pay = (periodId: string, lineId: string, actor = staff) => new RecordPayoutUseCase(port, () => NOW).execute(actor, periodId, lineId, { method: 'TRANSFER', ref: 'FT123' })

/** Spec §7.2 invariant: balance minus unpaid payables of all lines equals the debt left by the newest line. */
function expectInvariant() {
  for (const household of Array.from(new Set(port.lines.map((l) => l.household_id)))) {
    const latest = port.lines.filter((l) => l.household_id === household).slice(-1)[0]
    expect(port.balance(household) - port.unpaid(household)).toBe(-latest.debt_out_vnd)
  }
}

beforeEach(() => { port = new FakeSettlementPort() })

describe('creating a period', () => {
  beforeEach(() => { port.ticket('hh-1', '2026-11-20', 1_000_000) })

  it('creates the first draft from the earliest unsettled slip and codes it by the end date', async () => {
    const period = await create('2026-11-18', '2026-11-25')
    expect(period).toMatchObject({ code: 'TC-QT-20261125', status: 'DRAFT', created_by_name: 'Kế toán A' })
  })

  it('refuses a first period that starts after an unsettled slip', async () => {
    await expect(create('2026-11-21', '2026-11-25')).rejects.toThrow('Còn phiếu trước ngày bắt đầu kỳ.')
  })

  it('refuses an end day in the future and a farmer', async () => {
    await expect(create('2026-11-20', '2026-11-29')).rejects.toThrow('sau hôm nay')
    await expect(create('2026-11-20', '2026-11-25', farmer)).rejects.toThrow('Forbidden')
  })

  it('refuses a second draft, a gap and an overlap', async () => {
    const first = await create('2026-11-20', '2026-11-22')
    await expect(create('2026-11-23', '2026-11-25')).rejects.toThrow('kỳ nháp')
    await close(first.id, 1, '1000000')
    await expect(create('2026-11-24', '2026-11-25')).rejects.toThrow('hở ngày')
    await expect(create('2026-11-22', '2026-11-25')).rejects.toThrow('chồng ngày')
    expect((await create('2026-11-23', '2026-11-25')).date_from).toBe('2026-11-23')
  })
})

describe('draft preview', () => {
  it('shows each household with the settled numbers and totals, without an id', async () => {
    port.ticket('hh-1', '2026-11-20', 1_000_000, 500)
    port.advance('hh-1', '2026-11-21', 300_000)
    port.ticket('hh-2', '2026-11-21', 200_000)
    port.advance('hh-2', '2026-11-21', 500_000)
    const period = await create('2026-11-20', '2026-11-22')
    const detail = await new GetSettlementUseCase(port).execute(staff, period.id)
    expect(detail.lines.map((l) => [l.id, l.household_name, l.payable_vnd, l.debt_out_vnd])).toEqual([[null, 'Hộ A', '700000', '0'], [null, 'Hộ B', '0', '300000']])
    expect(detail.lines.every((l) => l.period_id === period.id)).toBe(true)
    expect(detail.totals).toEqual({ households: 2, leaf_amount_vnd: '1200000', advances_vnd: '800000', payable_vnd: '700000', debt_out_vnd: '300000' })
    expect(detail.lines[0].leaf_net_kg).toBe(50)
    await expect(new GetSettlementUseCase(port).execute(farmer, period.id)).rejects.toThrow('Forbidden')
  })
})

describe('closing a period', () => {
  async function seeded() {
    port.ticket('hh-1', '2026-11-20', 1_000_000)
    port.advance('hh-1', '2026-11-21', 300_000)
    port.ticket('hh-2', '2026-11-21', 200_000)
    port.advance('hh-2', '2026-11-21', 500_000)
    return create('2026-11-20', '2026-11-22')
  }

  it('writes lines, links the slips, books the ledger and keeps the invariant for every household', async () => {
    const period = await seeded()
    const detail = await close(period.id, 2, '700000')
    expect(detail.period).toMatchObject({ status: 'CLOSED', closed_by_name: 'Trưởng HTX' })
    expect(detail.lines.map((l) => [l.household_id, l.payable_vnd, l.debt_out_vnd])).toEqual([['hh-1', '700000', '0'], ['hh-2', '0', '300000']])
    expect(port.tickets.concat(port.advances).every((s) => s.settlement_id)).toBe(true)
    expect(port.ledger.map((e) => e.entry_type).sort()).toEqual(['INPUT_DEBIT', 'INPUT_DEBIT', 'LEAF_CREDIT', 'LEAF_CREDIT'])
    expect(port.ledger.every((e) => e.settlement_id)).toBe(true)
    expectInvariant()
  })

  it('lets only a manager close', async () => {
    const period = await seeded()
    await expect(close(period.id, 2, '700000', staff)).rejects.toThrow('Forbidden')
    expect(port.periods[0].status).toBe('DRAFT')
    expect(port.ledger).toHaveLength(0)
  })

  it('answers 409 PERIOD_CLOSED on a second close and writes nothing more', async () => {
    const period = await seeded()
    await close(period.id, 2, '700000')
    const ledger = port.ledger.length
    await expect(close(period.id, 2, '700000')).rejects.toMatchObject({ code: 'PERIOD_CLOSED' })
    expect(port.ledger).toHaveLength(ledger)
    expect(port.lines).toHaveLength(2)
  })

  it('answers 409 PERIOD_CHANGED with the new totals when a ticket is voided after the dialog opened, and writes nothing', async () => {
    const period = await seeded()
    port.tickets[0].status = 'VOIDED'
    const error = await close(period.id, 2, '700000').catch((e) => e)
    expect(error).toMatchObject({ code: 'PERIOD_CHANGED', details: { totals: { households: 2, payable_vnd: '0' } } })
    expect(port.ledger).toHaveLength(0)
    expect(port.lines).toHaveLength(0)
    expect(port.periods[0].status).toBe('DRAFT')
    expect(port.tickets.concat(port.advances).some((s) => s.settlement_id)).toBe(false)
  })

  it('rolls everything back when a write fails midway', async () => {
    const period = await seeded()
    let calls = 0
    const real = port.inTransaction.bind(port)
    port.inTransaction = ((ctx, work) => real(ctx, (unit) => work({ ...unit, addEntries: async (...args) => { if (++calls === 2) throw new Error('disk full'); return unit.addEntries(...args) } }))) as typeof port.inTransaction
    await expect(close(period.id, 2, '700000')).rejects.toThrow('disk full')
    expect(port.lines).toHaveLength(0)
    expect(port.ledger).toHaveLength(0)
    expect(port.periods[0].status).toBe('DRAFT')
  })

  it('subtracts a debt through an idle period (debt carries through an idle period)', async () => {
    port.ticket('hh-1', '2026-11-20', 200_000)
    port.advance('hh-1', '2026-11-20', 500_000)
    const p1 = await create('2026-11-20', '2026-11-22')
    await close(p1.id, 1, '0')
    expect(port.lines[0].debt_out_vnd).toBe(BigInt(300_000))

    port.ticket('hh-2', '2026-11-24', 400_000)
    const p2 = await create('2026-11-23', '2026-11-25')
    expect((await close(p2.id, 1, '400000')).lines.map((l) => l.household_id)).toEqual(['hh-2'])

    port.ticket('hh-1', '2026-11-26', 1_000_000)
    const p3 = await create('2026-11-26', '2026-11-27')
    const detail = await close(p3.id, 1, '700000')
    expect(detail.lines[0]).toMatchObject({ debt_in_vnd: '300000', payable_vnd: '700000', debt_out_vnd: '0' })
    expectInvariant()
  })

  it('keeps the invariant with an unpaid old payable and a credit adjustment', async () => {
    port.ticket('hh-1', '2026-11-20', 1_000_000)
    const p1 = await create('2026-11-20', '2026-11-22')
    await close(p1.id, 1, '1000000')
    await new CreateLedgerAdjustmentUseCase(port).execute(manager, { household_id: 'hh-1', amount_vnd: '-250000', reason: 'Trừ tiền bao bì' })
    port.ticket('hh-1', '2026-11-24', 100_000)
    port.advance('hh-1', '2026-11-24', 400_000)
    const p2 = await create('2026-11-23', '2026-11-25')
    const detail = await close(p2.id, 1, '0')
    expect(detail.lines[0]).toMatchObject({ debt_in_vnd: '250000', payable_vnd: '0', debt_out_vnd: '550000' })
    expectInvariant()
  })

  it('sweeps a slip that arrived late into the next period instead of losing it', async () => {
    port.ticket('hh-1', '2026-11-20', 100_000)
    const p1 = await create('2026-11-20', '2026-11-22')
    await close(p1.id, 1, '100000')
    port.ticket('hh-1', '2026-11-22', 50_000)
    const p2 = await create('2026-11-23', '2026-11-25')
    expect((await close(p2.id, 1, '50000')).lines[0].payable_vnd).toBe('50000')
  })
})

describe('payouts', () => {
  async function closed() {
    port.ticket('hh-1', '2026-11-20', 1_000_000)
    port.ticket('hh-2', '2026-11-20', 100_000)
    port.advance('hh-2', '2026-11-20', 400_000)
    const period = await create('2026-11-20', '2026-11-22')
    const detail = await close(period.id, 2, '1000000')
    return { period, a: detail.lines[0], b: detail.lines[1] }
  }

  it('records a payout once and books one PAYOUT entry', async () => {
    const { period, a } = await closed()
    const line = await pay(period.id, a.id!)
    expect(line).toMatchObject({ payment_method: 'TRANSFER', payment_ref: 'FT123' })
    expect(line.paid_at).not.toBeNull()
    expect(port.ledger.filter((e) => e.entry_type === 'PAYOUT')).toEqual([expect.objectContaining({ household_id: 'hh-1', amount_vnd: BigInt(-1_000_000) })])
    expect(port.balance('hh-1')).toBe(BigInt(0))
  })

  it('answers 409 to the second of two accountants paying at the same time', async () => {
    const { period, a } = await closed()
    const results = await Promise.allSettled([pay(period.id, a.id!), pay(period.id, a.id!)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'ALREADY_PAID' })
    expect(port.ledger.filter((e) => e.entry_type === 'PAYOUT')).toHaveLength(1)
  })

  it('answers 409 for a line with nothing payable, 404 for an unknown line, 403 for a farmer', async () => {
    const { period, b } = await closed()
    await expect(pay(period.id, b.id!)).rejects.toMatchObject({ code: 'NOTHING_TO_PAY' })
    await expect(pay(period.id, 'nope')).rejects.toThrow('Không tìm thấy')
    await expect(pay(period.id, b.id!, farmer)).rejects.toThrow('Forbidden')
    expect(port.ledger.filter((e) => e.entry_type === 'PAYOUT')).toHaveLength(0)
  })
})

describe('slip', () => {
  const lineOf = (payable: string) => ({ id: 'l-1', period_id: 'p-1', household_id: 'hh-1', household_name: 'Hộ A', leaf_net_kg: 10, leaf_amount_vnd: payable, advances_vnd: '0', debt_in_vnd: '0', payable_vnd: payable, debt_out_vnd: '0', paid_at: null, payment_method: null, payment_ref: null, has_bank_account: true })
  const source = (over: { bank_bin?: string | null; bank_account?: string | null; keycloak_user_id?: string | null; payable?: string } = {}) => ({
    htx: { name: 'HTX Tân Cương', code: 'TC' },
    household: { id: 'cl0household1234', name: 'Hộ A', keycloak_user_id: 'farmer-1', bank_bin: '970405', bank_account: '8600201001234', bank_account_name: 'NGUYEN VAN A', ...over },
    period: { id: 'p-1', code: 'TC-QT-20261125', date_from: '2026-11-20', date_to: '2026-11-25', status: 'CLOSED' as const, created_by_name: null, closed_by_name: null, closed_at: null },
    line: lineOf(over.payable ?? '700000'),
    tickets: [],
    advances: [],
  })
  const texts: string[] = []
  const slip = (actor: typeof staff) => new GetSettlementSlipUseCase(port, async (text) => { texts.push(text); return 'data:image/png;base64,AAA' }).execute(actor, 'p-1', 'l-1')
  beforeEach(() => { texts.length = 0 })

  it('puts the payable in the QR and shows staff the full account', async () => {
    port.slip = source()
    const result = await slip(staff)
    expect(result.qr).toMatchObject({ bank_name: 'Agribank', account_masked: '*********1234', account_full: '8600201001234' })
    expect(texts[0]).toContain('5406700000')
    expect(texts[0]).toContain('8600201001234')
    expect(result.transfer_note).toMatch(/^[\x20-\x7E]{1,25}$/)
    expect(texts[0]).toContain(result.transfer_note)
  })

  it('has no QR without bank details or without a payable amount', async () => {
    port.slip = source({ bank_account: null })
    expect((await slip(staff)).qr).toBeNull()
    port.slip = source({ payable: '0' })
    expect((await slip(staff)).qr).toBeNull()
    expect(texts).toHaveLength(0)
  })

  it('shows a farmer only their own slip with the masked number', async () => {
    port.slip = source()
    const result = await slip(farmer)
    expect(result.qr?.account_masked).toBe('*********1234')
    expect(result.qr).not.toHaveProperty('account_full')
    expect(JSON.stringify({ ...result, qr: { ...result.qr, data_url: '' } })).not.toContain('8600201001234')
    port.slip = source({ keycloak_user_id: 'someone-else' })
    await expect(slip(farmer)).rejects.toThrow('Không tìm thấy')
    port.slip = null
    await expect(slip(staff)).rejects.toThrow('Không tìm thấy')
    await expect(slip(officer)).rejects.toThrow('Forbidden')
  })
})

describe('adjustments', () => {
  const input = { household_id: 'hh-1', amount_vnd: '-100000', reason: 'Sửa nhầm số' }
  it('comes only from a manager, books one ADJUSTMENT and answers 404 for an unknown household', async () => {
    const useCase = new CreateLedgerAdjustmentUseCase(port)
    await expect(useCase.execute(staff, input)).rejects.toThrow('Forbidden')
    expect((await useCase.execute(manager, input)).amount_vnd).toBe('-100000')
    expect(port.balance('hh-1')).toBe(BigInt(-100000))
    await expect(useCase.execute(manager, { ...input, household_id: 'nope' })).rejects.toThrow('Không tìm thấy')
  })
})
