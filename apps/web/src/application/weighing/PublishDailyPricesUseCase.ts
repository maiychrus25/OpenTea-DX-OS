// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError } from '@/domain/errors'
import type { LeafPricePort, TodayPrices } from '@/domain/weighing/ports/LeafPricePort'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { dong, raiseZaloEvents, type ZaloEventSink } from '@/application/zalo/zalo-events'
import { priceEventId } from '@/domain/zalo/price-hash'
import { viDate } from './withdrawal-gate'

/** Sets today's price (Vietnam day) per grade. Publishing again the same day updates the rows. */
export class PublishDailyPricesUseCase {
  constructor(private readonly port: LeafPricePort, private readonly clock: () => Date = () => new Date(), private readonly zalo?: ZaloEventSink) {}

  async execute(actor: { userId: string; role: string; htxProfileId: string; htxCode?: string }, prices: { grade_id: string; price_vnd_per_kg: number }[]): Promise<TodayPrices> {
    if (actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    const at = this.clock()
    const day = vnDayOf(at)
    const ok = await this.port.upsertPrices({ htxProfileId: actor.htxProfileId, day, publishedById: actor.userId, prices, at })
    if (!ok) throw new NotFoundError('Không tìm thấy phẩm cấp')
    const today = await this.port.pricesFor(actor.htxProfileId, day)
    await this.announce(actor.htxCode, day, today)
    return today
  }

  /** One message per member for a given set of prices that day: the key is the day and a hash of the prices. */
  private async announce(htxCode: string | undefined, day: string, today: TodayPrices): Promise<void> {
    const priced = today.prices.filter((p): p is typeof p & { price_vnd_per_kg: number } => p.price_vnd_per_kg !== null)
    if (!htxCode || priced.length === 0) return
    await raiseZaloEvents(this.zalo, [{
      kind: 'PRICE_PUBLISHED',
      htxCode,
      eventId: priceEventId(htxCode, day, priced),
      householdId: null,
      params: { date: viDate(day), price_list: priced.map((p) => `${p.grade_name}: ${dong(p.price_vnd_per_kg)}/kg`).join('; ').slice(0, 200) },
    }])
  }
}
