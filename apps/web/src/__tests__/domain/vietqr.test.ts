// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { BANKS, bankByBin, crc16, payload, transferNote } from '@/domain/payment/vietqr'

const VECTOR = '00020101021238570010A00000072701270006970405011386002010012340208QRIBFTTA530370454065000005802VN62170813TOUR K7M2QX9A6304C17A'

describe('vietqr', () => {
  it('builds the payload of the original spec vector', () => {
    expect(payload('970405', '8600201001234', 500000n, 'TOUR K7M2QX9A')).toBe(VECTOR)
  })

  it('computes the standard CRC check string', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('has 21 unique six-digit BINs and unique names', () => {
    expect(BANKS).toHaveLength(21)
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(21)
    expect(new Set(BANKS.map((b) => b.name)).size).toBe(21)
    expect(BANKS.every((b) => /^[0-9]{6}$/.test(b.bin))).toBe(true)
  })

  it('looks a bank up by BIN', () => {
    expect(bankByBin('970405')?.name).toBe('Agribank')
    expect(bankByBin('000000')).toBeNull()
  })

  it.each([
    ['bad BIN', '97040', '8600201001234', 1000n, 'TOUR A'],
    ['account too short', '970405', '12345', 1000n, 'TOUR A'],
    ['account not digits', '970405', '86002010012x4', 1000n, 'TOUR A'],
    ['no amount', '970405', '8600201001234', 0n, 'TOUR A'],
    ['negative amount', '970405', '8600201001234', -5n, 'TOUR A'],
    ['not ASCII', '970405', '8600201001234', 1000n, 'TOUR Đ'],
    ['empty note', '970405', '8600201001234', 1000n, ''],
    ['note too long', '970405', '8600201001234', 1000n, 'x'.repeat(26)],
  ])('refuses %s', (_name, bin, account, amount, content) => {
    expect(() => payload(bin, account, amount, content)).toThrow()
  })

  it('writes the amount as exact digits for a large BigInt', () => {
    expect(payload('970405', '8600201001234', 12345678901234n, 'QT 1')).toContain('541412345678901234')
  })
})

describe('transferNote', () => {
  it('is ASCII, at most 25 characters and ends with the last four characters of the household id', () => {
    const note = transferNote('TC-QT-20261128', 'clxyz123456ab12')
    expect(note).toMatch(/^[\x20-\x7E]{1,25}$/)
    expect(note.endsWith('AB12')).toBe(true)
  })

  it('strips Vietnamese letters and still fits for a long code', () => {
    const note = transferNote('Tân-Cương-ĐẶC-BIỆT-QT-20261128-RẤT-DÀI', 'ĐỖ-1-ệ-9')
    expect(note).toMatch(/^[\x20-\x7E]{1,25}$/)
  })
})
