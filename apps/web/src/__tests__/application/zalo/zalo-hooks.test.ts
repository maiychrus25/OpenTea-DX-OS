/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PublishDailyPricesUseCase } from '@/application/weighing/PublishDailyPricesUseCase'
import { CreateFreshLeafTicketUseCase } from '@/application/weighing/CreateFreshLeafTicketUseCase'
import { CloseSettlementPeriodUseCase, CreateSettlementPeriodUseCase } from '@/application/ledger/SettlementUseCases'
import { WithdrawalEndedScan, type WithdrawalScanPort } from '@/application/zalo/WithdrawalEndedScan'
import { ZaloNotifier } from '@/application/zalo/ZaloNotifier'
import type { LeafPricePort, TodayPrices } from '@/domain/weighing/ports/LeafPricePort'
import type { ZaloEvent } from '@/domain/zalo/zalo-events'
import { FakeSettlementPort, manager, staff } from '../../../../__tests__/__mocks__/settlement-fakes'
import { FakeTicketPort, NOW, actor, input, spray } from '../../../../__tests__/__mocks__/weighing-fakes'
import { FakeZaloRepository, ON, seedHousehold, TEMPLATES } from '../../../../__tests__/__mocks__/zalo-fakes'

const sink = () => { const events: ZaloEvent[] = []; return { events, enqueue: jest.fn(async (e: ZaloEvent | ZaloEvent[]) => { events.push(...(Array.isArray(e) ? e : [e])); return { queued: 1, skipped: 0 } }) } }

describe('price hook', () => {
  const day = (prices: { g: string; n: string; p: number | null }[]): TodayPrices => ({
    date: '2026-11-28', published_at: null,
    prices: prices.map((x) => ({ grade_id: x.g, grade_name: x.n, price_vnd_per_kg: x.p, yesterday_vnd_per_kg: null })),
  })
  const port = (today: TodayPrices): jest.Mocked<LeafPricePort> => ({
    listGrades: jest.fn(), createGrade: jest.fn(), updateGrade: jest.fn(), pricesFor: jest.fn().mockResolvedValue(today), upsertPrices: jest.fn().mockResolvedValue(true),
  })
  const manager1 = { ...actor, role: 'manager' }
  const publish = (today: TodayPrices, s: ReturnType<typeof sink>) => new PublishDailyPricesUseCase(port(today), () => NOW, s).execute(manager1, [{ grade_id: 'g1', price_vnd_per_kg: 9000 }])

  it('raises one event for all members with the price list; the same prices again have the same key, a changed price a new one', async () => {
    const s = sink()
    await publish(day([{ g: 'g1', n: 'Loại 1', p: 9000 }, { g: 'g2', n: 'Loại 2', p: 7000 }]), s)
    await publish(day([{ g: 'g2', n: 'Loại 2', p: 7000 }, { g: 'g1', n: 'Loại 1', p: 9000 }]), s)
    await publish(day([{ g: 'g1', n: 'Loại 1', p: 9500 }, { g: 'g2', n: 'Loại 2', p: 7000 }]), s)
    expect(s.events[0]).toMatchObject({ kind: 'PRICE_PUBLISHED', htxCode: 'TC', householdId: null, params: { date: '28/11/2026', price_list: 'Loại 1: 9.000đ/kg; Loại 2: 7.000đ/kg' } })
    expect(s.events[1].eventId).toBe(s.events[0].eventId)
    expect(s.events[2].eventId).not.toBe(s.events[0].eventId)
  })

  it('raises nothing when no grade has a price, and never fails the publish when the channel is down', async () => {
    const s = sink()
    await publish(day([{ g: 'g1', n: 'Loại 1', p: null }]), s)
    expect(s.events).toEqual([])
    const broken = { enqueue: jest.fn().mockRejectedValue(new Error('db down')) }
    await expect(publish(day([{ g: 'g1', n: 'Loại 1', p: 9000 }]), broken as never)).resolves.toBeTruthy()
  })
})

describe('receipt hook', () => {
  it('raises one receipt for the household of a new ticket, and none for a replayed submission', async () => {
    const s = sink()
    const use = new CreateFreshLeafTicketUseCase(new FakeTicketPort(), () => NOW, s)
    const { ticket } = await use.execute(actor, input)
    const again = await use.execute(actor, { ...input, client_id: ticket.id }) // the fake port finds a replay by ticket id
    expect(again.created).toBe(false)
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({
      kind: 'TICKET_RECEIPT', htxCode: 'TC', eventId: ticket.id, householdId: 'hh-1',
      params: { ticket_no: ticket.ticket_no, date: '28/11/2026', net_kg: '95', amount_vnd: '1.425.000đ' },
    })
  })

  it('raises nothing when the ticket is refused, and never fails the weighing when the channel is down', async () => {
    const s = sink()
    const port = new FakeTicketPort()
    port.price = null
    await expect(new CreateFreshLeafTicketUseCase(port, () => NOW, s).execute(actor, input)).rejects.toThrow()
    expect(s.events).toEqual([])
    const ok = await new CreateFreshLeafTicketUseCase(new FakeTicketPort(), () => NOW, { enqueue: jest.fn().mockRejectedValue(new Error('down')) } as never).execute(actor, input)
    expect(ok.created).toBe(true)
  })
})

describe('settlement hook', () => {
  it('raises one event per line after the close: net pay or debt, no bank data', async () => {
    const port = new FakeSettlementPort()
    port.ticket('hh-1', '2026-11-20', 1_000_000)
    port.advance('hh-1', '2026-11-21', 300_000)
    port.ticket('hh-2', '2026-11-21', 200_000)
    port.advance('hh-2', '2026-11-21', 500_000)
    port.banks['hh-1'] = { bin: '970422', account: '9999888877', name: 'A', keycloak: null }
    const s = sink()
    const period = await new CreateSettlementPeriodUseCase(port, () => NOW).execute(staff, { date_from: '2026-11-20', date_to: '2026-11-22' })
    expect(s.events).toEqual([])
    process.env.DXOS_WEB_PUBLIC_URL = 'https://dx.example/'
    await new CloseSettlementPeriodUseCase(port, () => NOW, s).execute(manager, period.id, { household_count: 2, payable_total_vnd: '700000' })
    delete process.env.DXOS_WEB_PUBLIC_URL
    expect(s.events).toHaveLength(2)
    const byHousehold = Object.fromEntries(s.events.map((e) => [e.householdId, e]))
    expect(byHousehold['hh-1']).toMatchObject({ kind: 'SETTLEMENT_CLOSED', params: { result_label: 'Thực lĩnh', amount_vnd: '700.000đ', slip_url: `https://dx.example/farmer/settlements/${period.id}` } })
    expect(byHousehold['hh-2'].params).toMatchObject({ result_label: 'Còn nợ', amount_vnd: '300.000đ' })
    expect(new Set(s.events.map((e) => e.eventId)).size).toBe(2)
    expect(JSON.stringify(s.events)).not.toMatch(/9999888877|970422/)
  })

  it('raises nothing when the close is refused', async () => {
    const port = new FakeSettlementPort()
    port.ticket('hh-1', '2026-11-20', 1_000_000)
    const s = sink()
    const period = await new CreateSettlementPeriodUseCase(port, () => NOW).execute(staff, { date_from: '2026-11-20', date_to: '2026-11-22' })
    await expect(new CloseSettlementPeriodUseCase(port, () => NOW, s).execute(manager, period.id, { household_count: 9, payable_total_vnd: '1' })).rejects.toThrow()
    expect(s.events).toEqual([])
  })
})

describe('WithdrawalEndedScan', () => {
  // 10:00 on 2026-11-28 in Vietnam.
  const candidate = (id: string, entries: ReturnType<typeof spray>[]) => ({ parcelId: id, parcelCode: `P-${id}`, householdId: `hh-${id}`, htxCode: 'TC', entries })
  const scan = (candidates: ReturnType<typeof candidate>[], s: ReturnType<typeof sink>) =>
    new WithdrawalEndedScan(s, { candidates: jest.fn(async () => candidates) } as WithdrawalScanPort, () => NOW).run()

  it('raises an event for a parcel whose latest counted spraying ends today, keyed parcel and day', async () => {
    const s = sink()
    await scan([
      candidate('a', [spray('APPROVED', '2026-11-28T00:00:00+07:00')]),
      // a later spraying pushes the end to the 30th: still in withdrawal
      candidate('b', [spray('APPROVED', '2026-11-28T00:00:00+07:00'), spray('APPROVED', '2026-11-30T00:00:00+07:00', '2026-11-27T00:00:00Z')]),
      // a rejected spraying never counts, so only the approved one ending today matters
      candidate('c', [spray('APPROVED', '2026-11-28T00:00:00+07:00'), spray('REJECTED', '2026-12-05T00:00:00+07:00')]),
      // a spraying that ended earlier is not "today"
      candidate('d', [spray('APPROVED', '2026-11-26T00:00:00+07:00')]),
    ], s)
    expect(s.events.map((e) => e.eventId)).toEqual(['a:2026-11-28', 'c:2026-11-28'])
    expect(s.events[0]).toMatchObject({ kind: 'WITHDRAWAL_ENDED', htxCode: 'TC', householdId: 'hh-a', params: { parcel_code: 'P-a', safe_date: '28/11/2026' } })
    expect(JSON.stringify(s.events)).not.toMatch(/product|pesticide|thuốc/i)
  })

  it('is idempotent through the notifier: a second tick the same day queues nothing new', async () => {
    const repo = new FakeZaloRepository()
    repo.settingsByHtx.set('TC', ON)
    repo.templateList = TEMPLATES
    seedHousehold(repo, 'hh-a')
    const notifier = new ZaloNotifier(repo, () => NOW)
    const port = { candidates: async () => [candidate('a', [spray('APPROVED', '2026-11-28T00:00:00+07:00')])] }
    expect(await new WithdrawalEndedScan(notifier, port, () => NOW).run()).toBe(1)
    expect(await new WithdrawalEndedScan(notifier, port, () => NOW).run()).toBe(0)
    expect(repo.rows).toHaveLength(1)
  })
})

describe('feature off for the cooperative', () => {
  it('writes only skipped rows, so nothing can be leased', async () => {
    const repo = new FakeZaloRepository()
    repo.templateList = TEMPLATES // no settings row: Zalo is off
    seedHousehold(repo, 'hh-1')
    const notifier = new ZaloNotifier(repo, () => NOW)
    await new CreateFreshLeafTicketUseCase(new FakeTicketPort(), () => NOW, notifier).execute(actor, input)
    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'ZALO_OFF' })
    expect(await notifier.lease(20)).toEqual([])
  })
})
