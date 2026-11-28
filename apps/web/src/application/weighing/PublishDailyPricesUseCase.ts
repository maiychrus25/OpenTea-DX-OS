// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError } from '@/domain/errors'
import type { LeafPricePort, TodayPrices } from '@/domain/weighing/ports/LeafPricePort'
import { vnDayOf } from '@/application/agent/campaign/vn-day'

/** Sets today's price (Vietnam day) per grade. Publishing again the same day updates the rows. */
export class PublishDailyPricesUseCase {
  constructor(private readonly port: LeafPricePort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: { userId: string; role: string; htxProfileId: string }, prices: { grade_id: string; price_vnd_per_kg: number }[]): Promise<TodayPrices> {
    if (actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    const at = this.clock()
    const day = vnDayOf(at)
    const ok = await this.port.upsertPrices({ htxProfileId: actor.htxProfileId, day, publishedById: actor.userId, prices, at })
    if (!ok) throw new NotFoundError('Không tìm thấy phẩm cấp')
    return this.port.pricesFor(actor.htxProfileId, day)
  }
}
