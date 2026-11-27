// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { MONEY_ALERTS, type BoardAlert, type DirectorBoard, type LeafToday, type MemberPayable } from '@/domain/board/views'
import type { BoardSource } from '@/domain/board/ports/BoardSource'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import { logger } from '@/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000
const PRICE_DEADLINE_MS = 7 * 60 * 60 * 1000

/** The Vietnam day `n` days from `day` (negative for before). */
function shiftDay(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

export class DirectorBoardUseCase {
  constructor(private readonly source: BoardSource) {}

  /** Each block loads on its own: one that throws is null and the rest still come back. */
  async read(htxProfileId: string, now: Date, role: 'manager' | 'accountant'): Promise<DirectorBoard> {
    const today = vnDayOf(now)
    const pricesBlock = this.block('prices', () => this.source.prices(htxProfileId, today))
    const [leaf, prices, payable, dry_stock, alerts] = await Promise.all([
      this.block('leaf', () => this.leaf(htxProfileId, today)),
      pricesBlock,
      this.block('payable', () => this.payable(htxProfileId)),
      this.block('dry_stock', () => this.source.dryStock(htxProfileId)),
      this.block('alerts', () => this.alerts(htxProfileId, now, today, role, pricesBlock)),
    ])
    return { today, leaf, prices, payable, dry_stock, receivables: { available: false }, alerts }
  }

  private async block<T>(name: string, load: () => Promise<T>): Promise<T | null> {
    try {
      return await load()
    } catch (error) {
      logger.error(`Director board block ${name} failed`, { error })
      return null
    }
  }

  private async leaf(htxProfileId: string, today: string): Promise<LeafToday> {
    const start = vnDayStart(today)
    const [day, before] = await Promise.all([
      this.source.leafBetween(htxProfileId, start, new Date(start.getTime() + DAY_MS)),
      this.source.leafBetween(htxProfileId, new Date(start.getTime() - DAY_MS), start),
    ])
    return { net_kg: day.net_kg, amount_vnd: day.amount_vnd.toString(), tickets: day.tickets, yesterday_net_kg: before.net_kg }
  }

  private async payable(htxProfileId: string): Promise<MemberPayable> {
    const p = await this.source.payable(htxProfileId)
    return {
      unpaid_lines_vnd: p.unpaid_lines_vnd.toString(),
      unsettled_leaf_vnd: p.unsettled_leaf_vnd.toString(),
      unsettled_advances_vnd: p.unsettled_advances_vnd.toString(),
      total_vnd: (p.unpaid_lines_vnd + p.unsettled_leaf_vnd - p.unsettled_advances_vnd).toString(),
    }
  }

  private async alerts(htxProfileId: string, now: Date, today: string, role: 'manager' | 'accountant', pricesBlock: Promise<{ published: boolean } | null>): Promise<BoardAlert[]> {
    const s = this.source
    const accountant = role === 'accountant'
    const [withdrawal, outOfBand, openTooLong, oldStock, drafts, unpaid, prices] = await Promise.all([
      s.parcelsInWithdrawal(htxProfileId, today),
      s.outOfBandBatchesSince(htxProfileId, vnDayStart(shiftDay(today, -30))),
      s.openBatchesOnOrBefore(htxProfileId, shiftDay(today, -3)),
      s.stockRowsOnOrBefore(htxProfileId, shiftDay(today, -61)),
      s.draftPeriods(htxProfileId),
      // Closed on or before the day 8 days back = more than 7 days ago.
      s.unpaidLinesClosedBefore(htxProfileId, vnDayStart(shiftDay(today, -7))),
      pricesBlock,
    ])
    const late = now.getTime() >= vnDayStart(today).getTime() + PRICE_DEADLINE_MS
    const all: (BoardAlert | null)[] = [
      withdrawal > 0 ? { kind: 'PARCELS_IN_WITHDRAWAL', count: withdrawal, message: `${withdrawal} nương đang trong thời gian cách ly`, href: '/manager/schedule' } : null,
      outOfBand > 0 ? { kind: 'BATCH_OUT_OF_BAND', count: outOfBand, message: `${outOfBand} mẻ lệch khoảng chuẩn trong 30 ngày`, href: '/manager/processing' } : null,
      openTooLong > 0 ? { kind: 'BATCH_OPEN_TOO_LONG', count: openTooLong, message: `${openTooLong} mẻ còn mở quá 2 ngày`, href: '/manager/processing' } : null,
      oldStock > 0 ? { kind: 'OLD_DRY_STOCK', count: oldStock, message: `${oldStock} dòng tồn chè khô quá 60 ngày`, href: '/manager/processing' } : null,
      drafts.length > 0 ? { kind: 'SETTLEMENT_DRAFT', count: 1, message: `Kỳ quyết toán ${drafts[0].code} còn nháp`, href: `/${role}/settlements/${drafts[0].id}` } : null,
      unpaid > 0 ? { kind: 'UNPAID_LINES', count: unpaid, message: `${unpaid} hộ chưa nhận tiền quyết toán quá 7 ngày`, href: `/${role}/settlements` } : null,
      prices && !prices.published && late ? { kind: 'PRICE_NOT_PUBLISHED', count: 1, message: 'Chưa công bố giá thu mua hôm nay', href: accountant ? '/accountant/dashboard' : '/manager/leaf-prices' } : null,
    ]
    const found = all.filter((a): a is BoardAlert => a !== null)
    return accountant ? found.filter((a) => MONEY_ALERTS.includes(a.kind)) : found
  }
}
