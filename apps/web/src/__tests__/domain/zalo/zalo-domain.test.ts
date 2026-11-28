// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { deliveryTime } from '@/domain/zalo/quiet-hours'
import { normalizePhone } from '@/domain/zalo/phone'
import { priceEventId } from '@/domain/zalo/price-hash'
import { errorLabelVi, skipReasonLabelVi, TEMPLATE_PARAM_KEYS, templateKeyOf } from '@/domain/zalo/zalo-events'

const quiet = { quietStartHour: 21, quietEndHour: 6 }
// Vietnam is UTC+7: 21:30 VN is 14:30Z.
const vn = (iso: string) => new Date(`${iso}+07:00`)

describe('deliveryTime (quiet hours 21:00-06:00 Vietnam time)', () => {
  it('sends at once outside quiet hours', () => {
    const now = vn('2026-11-28T10:00:00')
    expect(deliveryTime(now, 'TICKET_RECEIPT', quiet)).toEqual(now)
  })

  it('moves a ticket weighed at 21:30 to 06:00 the next day', () => {
    expect(deliveryTime(vn('2026-11-28T21:30:00'), 'TICKET_RECEIPT', quiet)).toEqual(vn('2026-11-29T06:00:00'))
  })

  it('moves a ticket at 02:00 to 06:00 the same day, and sends at exactly 06:00', () => {
    expect(deliveryTime(vn('2026-11-28T02:00:00'), 'SETTLEMENT_CLOSED', quiet)).toEqual(vn('2026-11-28T06:00:00'))
    const six = vn('2026-11-28T06:00:00')
    expect(deliveryTime(six, 'SETTLEMENT_CLOSED', quiet)).toEqual(six)
  })

  it('starts quiet hours at exactly 21:00', () => {
    expect(deliveryTime(vn('2026-11-28T21:00:00'), 'TICKET_RECEIPT', quiet)).toEqual(vn('2026-11-29T06:00:00'))
    const early = vn('2026-11-28T20:59:00')
    expect(deliveryTime(early, 'TICKET_RECEIPT', quiet)).toEqual(early)
  })

  it('lets the price and the withdrawal-ended messages go from 05:00', () => {
    expect(deliveryTime(vn('2026-11-28T03:00:00'), 'PRICE_PUBLISHED', quiet)).toEqual(vn('2026-11-28T05:00:00'))
    expect(deliveryTime(vn('2026-11-28T22:00:00'), 'WITHDRAWAL_ENDED', quiet)).toEqual(vn('2026-11-29T05:00:00'))
    const five = vn('2026-11-28T05:30:00')
    expect(deliveryTime(five, 'WITHDRAWAL_ENDED', quiet)).toEqual(five)
  })
})

describe('normalizePhone', () => {
  it.each([
    ['0912345678', '84912345678'],
    ['+84 912 345 678', '84912345678'],
    ['84912345678', '84912345678'],
    ['0912.345.678', '84912345678'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected))

  it.each(['', '12345', '0912345', 'abc', '+1 415 555 0100'])('refuses %s', (input) => expect(normalizePhone(input)).toBeNull())
})

describe('priceEventId', () => {
  const a = { grade_id: 'g1', price_vnd_per_kg: 9000 }
  const b = { grade_id: 'g2', price_vnd_per_kg: 7000 }

  it('is the same for the same prices in any order, and differs when a price changes', () => {
    const id = priceEventId('TC', '2026-11-28', [a, b])
    expect(id).toBe(priceEventId('TC', '2026-11-28', [b, a]))
    expect(id).toMatch(/^TC:2026-11-28:[0-9a-f]{64}$/)
    expect(priceEventId('TC', '2026-11-28', [a, { ...b, price_vnd_per_kg: 7100 }])).not.toBe(id)
    expect(priceEventId('TC', '2026-11-29', [a, b])).not.toBe(id)
  })
})

describe('templates and labels', () => {
  it('maps every kind to one of the four template keys', () => {
    expect(templateKeyOf('PRICE_PUBLISHED')).toBe('price_today')
    expect(templateKeyOf('TICKET_RECEIPT')).toBe('ticket_receipt')
    expect(templateKeyOf('WITHDRAWAL_ENDED')).toBe('withdrawal_ended')
    expect(templateKeyOf('SETTLEMENT_CLOSED')).toBe('settlement_closed')
  })

  it('never allows a bank account or a pesticide name as a parameter', () => {
    const all = Object.values(TEMPLATE_PARAM_KEYS).flat().join(' ')
    expect(all).not.toMatch(/bank|account|pesticide|product/i)
  })

  it('explains skip reasons and Zalo errors in Vietnamese', () => {
    expect(skipReasonLabelVi('NO_CONSENT')).toMatch(/đồng ý/)
    expect(errorLabelVi('Zalo -108: user not found')).toMatch(/Zalo/)
    expect(errorLabelVi('Zalo -124 quota')).toMatch(/hạn mức/)
    expect(errorLabelVi('something odd')).toBeTruthy()
  })
})
