// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ZaloNotifier } from '@/application/zalo/ZaloNotifier'
import type { ZaloEvent } from '@/domain/zalo/zalo-events'
import { FakeZaloRepository, ON, seedHousehold, TEMPLATES } from '../../../../__tests__/__mocks__/zalo-fakes'

const NOON = new Date('2026-11-28T05:00:00Z') // 12:00 Vietnam time
const receipt = (overrides: Partial<ZaloEvent> = {}): ZaloEvent => ({
  kind: 'TICKET_RECEIPT', htxCode: 'TC', eventId: 'ticket-1', householdId: 'hh-1',
  params: { ticket_no: 'TC-PC-1', date: '28/11/2026', net_kg: '12.5', amount_vnd: '150000' }, ...overrides,
})

function setup(opts: { optedIn?: boolean } = {}) {
  const repo = new FakeZaloRepository()
  repo.settingsByHtx.set('TC', ON)
  repo.templateList = TEMPLATES
  seedHousehold(repo, 'hh-1', '0912345678', 'TC', opts.optedIn ?? true)
  let now = NOON
  const notifier = new ZaloNotifier(repo, () => now)
  return { repo, notifier, setNow: (d: Date) => { now = d } }
}

describe('ZaloNotifier.enqueue', () => {
  it('queues a pending row for an opted-in household, with the 84 phone and only the template params', async () => {
    const { repo, notifier } = setup()
    expect(await notifier.enqueue(receipt())).toEqual({ queued: 1, skipped: 0 })
    expect(repo.rows[0]).toMatchObject({ status: 'pending', phone: '84912345678', templateKey: 'ticket_receipt', nextAttemptAt: NOON })
    expect(Object.keys(repo.rows[0].params).sort()).toEqual(['amount_vnd', 'date', 'net_kg', 'ticket_no'])
  })

  it('sends one message per event: the same event twice writes one row', async () => {
    const { repo, notifier } = setup()
    await notifier.enqueue(receipt())
    expect(await notifier.enqueue(receipt())).toEqual({ queued: 0, skipped: 0 })
    expect(repo.rows).toHaveLength(1)
  })

  it.each([
    ['the kind is off', (r: FakeZaloRepository) => r.settingsByHtx.set('TC', { ...ON, kinds: ['PRICE_PUBLISHED'] }), 'KIND_OFF'],
    ['there is no template', (r: FakeZaloRepository) => { r.templateList = [] }, 'NO_TEMPLATE'],
    ['the template asks for a param the event cannot give', (r: FakeZaloRepository) => { r.templateList = [{ ...TEMPLATES[1], params: ['ticket_no', 'bank_account'] }] }, 'BAD_TEMPLATE'],
    ['the quota is reached', (r: FakeZaloRepository) => r.monthly.set('TC', 2000), 'QUOTA_REACHED'],
  ])('writes a skipped row when %s', async (_name, arrange, reason) => {
    const { repo, notifier } = setup()
    arrange(repo)
    expect(await notifier.enqueue(receipt())).toEqual({ queued: 0, skipped: 1 })
    expect(repo.rows[0]).toMatchObject({ status: 'skipped', lastError: reason })
    expect(await notifier.lease(20)).toEqual([])
  })

  it('skips a household without an OPTED_IN row, and one whose latest row is OPTED_OUT', async () => {
    const none = setup({ optedIn: false })
    await none.notifier.enqueue(receipt())
    expect(none.repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'NO_CONSENT' })

    const out = setup()
    out.repo.consents.push({ householdId: 'hh-1', recordedBy: 'farmer-1', state: { status: 'OPTED_OUT', phone: '84912345678', source: 'MEMBER', at: new Date() } })
    await out.notifier.enqueue(receipt())
    expect(out.repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'CONSENT_REVOKED' })
  })

  it('skips a consent given for another phone number', async () => {
    const { repo, notifier } = setup()
    repo.households[0].phone = '0987654321'
    await notifier.enqueue(receipt())
    expect(repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'NO_CONSENT' })
  })

  it('skips an invalid phone and counts the quota across a batch', async () => {
    const { repo, notifier } = setup()
    seedHousehold(repo, 'hh-2', '12345', 'TC')
    seedHousehold(repo, 'hh-3', '0911111111', 'TC')
    seedHousehold(repo, 'hh-4', '0922222222', 'TC')
    repo.settingsByHtx.set('TC', { ...ON, monthlyQuota: 2 })
    const price: ZaloEvent = { kind: 'PRICE_PUBLISHED', htxCode: 'TC', eventId: 'TC:2026-11-28:h', householdId: null, params: { date: '28/11/2026', price_list: 'Loại 1: 9.000' } }
    expect(await notifier.enqueue(price)).toEqual({ queued: 2, skipped: 2 })
    const reasons = Object.fromEntries(repo.rows.map((r) => [r.householdId, r.lastError]))
    expect(reasons).toMatchObject({ 'hh-1': null, 'hh-2': 'INVALID_PHONE', 'hh-3': null, 'hh-4': 'QUOTA_REACHED' })
  })

  it('moves a ticket weighed at 21:30 to 06:00, and the price message to 05:00', async () => {
    const { repo, notifier, setNow } = setup()
    setNow(new Date('2026-11-28T14:30:00Z')) // 21:30 Vietnam
    await notifier.enqueue(receipt())
    await notifier.enqueue({ kind: 'PRICE_PUBLISHED', htxCode: 'TC', eventId: 'p1', householdId: 'hh-1', params: { date: 'x', price_list: 'y' } })
    expect(repo.rows[0].nextAttemptAt).toEqual(new Date('2026-11-28T23:00:00Z')) // 06:00 next day
    expect(repo.rows[1].nextAttemptAt).toEqual(new Date('2026-11-28T22:00:00Z')) // 05:00 next day
    expect(await notifier.lease(20)).toEqual([])
    setNow(new Date('2026-11-28T23:00:00Z'))
    expect((await notifier.lease(20)).map((m) => m.id)).toEqual(['row-1', 'row-2'])
  })
})

describe('ZaloNotifier.lease', () => {
  it('returns the relay contract and re-checks consent: an opt-out after queuing is skipped', async () => {
    const { repo, notifier } = setup()
    await notifier.enqueue(receipt())
    repo.consents.push({ householdId: 'hh-1', recordedBy: 'farmer-1', state: { status: 'OPTED_OUT', phone: '84912345678', source: 'MEMBER', at: new Date() } })
    expect(await notifier.lease(20)).toEqual([])
    expect(repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'CONSENT_REVOKED' })
  })

  it('writes no row at all while the cooperative has Zalo off', async () => {
    const { repo, notifier } = setup()
    repo.settingsByHtx.set('TC', { ...ON, enabled: false })
    expect(await notifier.enqueue(receipt())).toEqual({ queued: 0, skipped: 0 })
    expect(repo.rows).toHaveLength(0)
  })

  it('returns the template id from the table at lease time, and skips when Zalo was turned off meanwhile', async () => {
    const { repo, notifier } = setup()
    await notifier.enqueue(receipt())
    expect(await notifier.lease(20)).toEqual([
      { id: 'row-1', phone: '84912345678', zns_template_id: '222', template_data: repo.rows[0].params, tracking_id: 'row-1' },
    ])

    const off = setup()
    await off.notifier.enqueue(receipt())
    off.repo.settingsByHtx.set('TC', { ...ON, enabled: false })
    expect(await off.notifier.lease(20)).toEqual([])
    expect(off.repo.rows[0]).toMatchObject({ status: 'skipped', lastError: 'ZALO_OFF' })
  })

  it('fails a row whose lease expired after the tenth attempt instead of sending an eleventh', async () => {
    const { repo, notifier } = setup()
    await notifier.enqueue(receipt())
    repo.rows[0].attempts = 10
    expect(await notifier.lease(20)).toEqual([])
    expect(repo.rows[0]).toMatchObject({ status: 'failed', lastError: 'MAX_ATTEMPTS' })
  })
})

describe('ZaloNotifier.recordResult', () => {
  async function leased() {
    const ctx = setup()
    await ctx.notifier.enqueue(receipt())
    await ctx.notifier.lease(20)
    return ctx
  }

  it('marks a sent row and keeps answering sent for a repeated result', async () => {
    const { repo, notifier } = await leased()
    expect(await notifier.recordResult('row-1', { ok: true, zalo_msg_id: 'm1' })).toBe('sent')
    expect(repo.rows[0].status).toBe('sent')
    expect(await notifier.recordResult('row-1', { ok: false, error: 'late' })).toBe('sent')
    expect(repo.rows[0].status).toBe('sent')
  })

  it('does not retry a permanent error and keeps the reason', async () => {
    const { repo, notifier } = await leased()
    expect(await notifier.recordResult('row-1', { ok: false, error: 'Zalo -108', permanent: true })).toBe('failed')
    expect(repo.rows[0]).toMatchObject({ status: 'failed', lastError: 'Zalo -108' })
  })

  it('retries with backoff min(5*2^(n-1), 900) seconds, or the relay hint', async () => {
    const { repo, notifier } = await leased()
    expect(await notifier.recordResult('row-1', { ok: false, error: 'http 500' })).toBe('pending')
    expect(repo.rows[0].nextAttemptAt).toEqual(new Date(NOON.getTime() + 5_000))

    repo.rows[0].status = 'leased'
    repo.rows[0].attempts = 9
    await notifier.recordResult('row-1', { ok: false, error: 'http 500' })
    expect(repo.rows[0].nextAttemptAt).toEqual(new Date(NOON.getTime() + 900_000))

    repo.rows[0].status = 'leased'
    repo.rows[0].attempts = 2
    await notifier.recordResult('row-1', { ok: false, error: '429', retry_after_seconds: 120 })
    expect(repo.rows[0].nextAttemptAt).toEqual(new Date(NOON.getTime() + 120_000))
  })

  it('gives up after 10 attempts and answers null for an unknown row', async () => {
    const { repo, notifier } = await leased()
    repo.rows[0].attempts = 10
    expect(await notifier.recordResult('row-1', { ok: false, error: 'http 500' })).toBe('failed')
    expect(await notifier.recordResult('nope', { ok: true, zalo_msg_id: 'm' })).toBeNull()
  })

  it('never retries inside quiet hours', async () => {
    const { repo, notifier, setNow } = await leased()
    setNow(new Date('2026-11-28T13:59:00Z')) // 20:59 Vietnam, the retry lands at 21:00
    await notifier.recordResult('row-1', { ok: false, error: 'http 500', retry_after_seconds: 120 })
    expect(repo.rows[0].nextAttemptAt).toEqual(new Date('2026-11-28T23:00:00Z'))
  })
})
