// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DirectorBoardUseCase } from '@/application/board/DirectorBoardUseCase'
import type { BoardSource } from '@/domain/board/ports/BoardSource'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

// 2026-11-28 10:00 in Vietnam.
const NOW = new Date('2026-11-28T03:00:00Z')
const B = BigInt

function source(over: Partial<BoardSource> = {}): BoardSource {
  return {
    leafBetween: jest.fn(async (_h, from) => (from.toISOString() === '2026-11-27T17:00:00.000Z' ? { net_kg: 120.5, amount_vnd: B(2400000), tickets: 7 } : { net_kg: 100, amount_vnd: B(1800000), tickets: 5 })),
    prices: jest.fn(async () => ({ published: true, grades: [{ grade_id: 'g1', grade_name: 'Búp 1 tôm 2 lá', price_vnd_per_kg: 9000 }] })),
    payable: jest.fn(async () => ({ unpaid_lines_vnd: B(5000000), unsettled_leaf_vnd: B(3000000), unsettled_advances_vnd: B(1000000) })),
    dryStock: jest.fn(async () => [{ grade: 'DINH' as const, kg: 3.5 }]),
    parcelsInWithdrawal: jest.fn(async () => 0),
    outOfBandBatchesSince: jest.fn(async () => 0),
    openBatchesOnOrBefore: jest.fn(async () => 0),
    stockRowsOnOrBefore: jest.fn(async () => 0),
    draftPeriods: jest.fn(async () => []),
    unpaidLinesClosedBefore: jest.fn(async () => 0),
    ...over,
  }
}

const read = (s: BoardSource, now = NOW, role: 'manager' | 'accountant' = 'manager') => new DirectorBoardUseCase(s).read('htx-1', now, role)

describe('DirectorBoardUseCase blocks', () => {
  it('reads today, yesterday, prices, payable and stock', async () => {
    const s = source({ leafBetween: jest.fn(async (_h, from) => (from.getTime() === new Date('2026-11-27T17:00:00Z').getTime() ? { net_kg: 100, amount_vnd: B(1800000), tickets: 5 } : { net_kg: 90, amount_vnd: B(0), tickets: 1 })) })
    const board = await read(s)
    expect(board.today).toBe('2026-11-28')
    expect(board.leaf).toEqual({ net_kg: 100, amount_vnd: '1800000', tickets: 5, yesterday_net_kg: 90 })
    expect(s.leafBetween).toHaveBeenCalledWith('htx-1', new Date('2026-11-27T17:00:00Z'), new Date('2026-11-28T17:00:00Z'))
    expect(s.leafBetween).toHaveBeenCalledWith('htx-1', new Date('2026-11-26T17:00:00Z'), new Date('2026-11-27T17:00:00Z'))
    expect(board.prices?.published).toBe(true)
    expect(board.payable).toEqual({ unpaid_lines_vnd: '5000000', unsettled_leaf_vnd: '3000000', unsettled_advances_vnd: '1000000', total_vnd: '7000000' })
    expect(board.dry_stock).toEqual([{ grade: 'DINH', kg: 3.5 }])
    expect(board.receivables).toEqual({ available: false })
    expect(board.alerts).toEqual([])
  })

  it('can owe less than zero in total', async () => {
    const board = await read(source({ payable: async () => ({ unpaid_lines_vnd: B(0), unsettled_leaf_vnd: B(100), unsettled_advances_vnd: B(250) }) }))
    expect(board.payable?.total_vnd).toBe('-150')
  })

  it('turns a failing block into null and still loads the others', async () => {
    const board = await read(source({ leafBetween: async () => { throw new Error('boom') }, dryStock: async () => { throw new Error('boom') } }))
    expect(board.leaf).toBeNull()
    expect(board.dry_stock).toBeNull()
    expect(board.payable).not.toBeNull()
    expect(board.prices).not.toBeNull()
    expect(board.alerts).toEqual([])
  })

  it('nulls alerts when one alert query fails, and keeps price alert out when prices failed', async () => {
    expect((await read(source({ draftPeriods: async () => { throw new Error('x') } }))).alerts).toBeNull()
    const late = new Date('2026-11-28T02:00:00Z') // 09:00
    const board = await read(source({ prices: async () => { throw new Error('x') } }), late)
    expect(board.prices).toBeNull()
    expect(board.alerts).toEqual([])
  })

  it('scopes every query to the cooperative asked for', async () => {
    const s = source()
    await new DirectorBoardUseCase(s).read('htx-7', NOW, 'manager')
    for (const fn of Object.values(s)) for (const call of (fn as jest.Mock).mock.calls) expect(call[0]).toBe('htx-7')
  })
})

describe('DirectorBoardUseCase alerts', () => {
  it('lists every kind in order with message and link', async () => {
    const board = await read(source({
      prices: async () => ({ published: false, grades: [] }),
      parcelsInWithdrawal: async () => 2,
      outOfBandBatchesSince: async () => 3,
      openBatchesOnOrBefore: async () => 1,
      stockRowsOnOrBefore: async () => 4,
      draftPeriods: async () => [{ id: 'p1', code: 'T-QT-20261120' }],
      unpaidLinesClosedBefore: async () => 5,
    }))
    expect(board.alerts).toEqual([
      { kind: 'PARCELS_IN_WITHDRAWAL', count: 2, message: '2 nương đang trong thời gian cách ly', href: '/manager/schedule' },
      { kind: 'BATCH_OUT_OF_BAND', count: 3, message: '3 mẻ lệch khoảng chuẩn trong 30 ngày', href: '/manager/processing' },
      { kind: 'BATCH_OPEN_TOO_LONG', count: 1, message: '1 mẻ còn mở quá 2 ngày', href: '/manager/processing' },
      { kind: 'OLD_DRY_STOCK', count: 4, message: '4 dòng tồn chè khô quá 60 ngày', href: '/manager/processing' },
      { kind: 'SETTLEMENT_DRAFT', count: 1, message: 'Kỳ quyết toán T-QT-20261120 còn nháp', href: '/manager/settlements/p1' },
      { kind: 'UNPAID_LINES', count: 5, message: '5 hộ chưa nhận tiền quyết toán quá 7 ngày', href: '/manager/settlements' },
      { kind: 'PRICE_NOT_PUBLISHED', count: 1, message: 'Chưa công bố giá thu mua hôm nay', href: '/manager/leaf-prices' },
    ])
  })

  it('passes the day boundaries: open 3 days, stock 61 days, closed 8 days, out of band 30 days', async () => {
    const s = source()
    await read(s)
    expect(s.openBatchesOnOrBefore).toHaveBeenCalledWith('htx-1', '2026-11-25') // 2 days open (11-26) is fine, 3 days (11-25) alerts
    expect(s.stockRowsOnOrBefore).toHaveBeenCalledWith('htx-1', '2026-09-28') // 60 days = 09-29 fine, 61 days alerts
    expect(s.unpaidLinesClosedBefore).toHaveBeenCalledWith('htx-1', new Date('2026-11-20T17:00:00Z')) // closed 11-21 (7 days) fine, 11-20 alerts
    expect(s.outOfBandBatchesSince).toHaveBeenCalledWith('htx-1', new Date('2026-10-28T17:00:00Z'))
  })

  it('raises the price alert at 07:00 Vietnam, not at 06:59', async () => {
    const unpublished = { prices: async () => ({ published: false, grades: [] }) }
    expect((await read(source(unpublished), new Date('2026-11-27T23:59:59Z'))).alerts).toEqual([]) // 06:59:59
    expect((await read(source(unpublished), new Date('2026-11-28T00:00:00Z'))).alerts?.map((a) => a.kind)).toEqual(['PRICE_NOT_PUBLISHED']) // 07:00
    expect((await read(source(), new Date('2026-11-28T05:00:00Z'))).alerts).toEqual([])
  })

  it('shows the accountant only money alerts, with accountant links', async () => {
    const board = await read(source({
      prices: async () => ({ published: false, grades: [] }),
      parcelsInWithdrawal: async () => 2,
      outOfBandBatchesSince: async () => 3,
      openBatchesOnOrBefore: async () => 1,
      stockRowsOnOrBefore: async () => 4,
      draftPeriods: async () => [{ id: 'p1', code: 'C1' }],
      unpaidLinesClosedBefore: async () => 5,
    }), NOW, 'accountant')
    expect(board.alerts?.map((a) => [a.kind, a.href])).toEqual([
      ['SETTLEMENT_DRAFT', '/accountant/settlements/p1'],
      ['UNPAID_LINES', '/accountant/settlements'],
      ['PRICE_NOT_PUBLISHED', '/accountant/dashboard'],
    ])
  })
})
