// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SeasonReport } from '@/domain/report/views'
import type { ReportRange, ReportSource } from '@/domain/report/ports/ReportSource'
import { vnDayStart } from '@/application/agent/campaign/vn-day'
import { logger } from '@/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

export class SeasonReportUseCase {
  constructor(private readonly source: ReportSource) {}

  /** Each section loads on its own: one that throws is null and the rest still come back. */
  async read(htxProfileId: string, from: string, to: string): Promise<SeasonReport> {
    const range: ReportRange = { from, to, start: vnDayStart(from), end: new Date(vnDayStart(to).getTime() + DAY_MS) }
    const s = this.source
    const [name, members, purchases, member_money, processing, lots, sales, safety] = await Promise.all([
      this.section('htx_name', () => s.htxName(htxProfileId)),
      this.section('members', () => s.members(htxProfileId)),
      this.section('purchases', () => this.purchases(htxProfileId, range)),
      this.section('member_money', async () => {
        const m = await s.memberMoney(htxProfileId, range)
        return { periods_closed: m.periods_closed, paid_vnd: m.paid_vnd.toString(), payable_open_vnd: m.payable_open_vnd.toString(), advances_vnd: m.advances_vnd.toString() }
      }),
      this.section('processing', async () => {
        const p = await s.processing(htxProfileId, range)
        return { ...p, fresh_kg: round(p.fresh_kg, 1), dry_kg: round(p.dry_kg, 1), avg_ratio: p.dry_kg > 0 ? round(p.fresh_kg / p.dry_kg, 2) : null }
      }),
      this.section('lots', () => s.lots(htxProfileId, range)),
      this.section('sales', async () => {
        const x = await s.sales(htxProfileId, range)
        return { wholesale_vnd: x.wholesale_vnd.toString(), retail_vnd: x.retail_vnd.toString(), kg_sold: round(x.kg_sold, 1), receivable_vnd: x.receivable_vnd.toString(), top_partners: x.top_partners.map((t) => ({ partner_name: t.partner_name, amount_vnd: t.amount_vnd.toString() })) }
      }),
      this.section('safety', () => s.safety(htxProfileId, range)),
    ])
    return { htx_name: name ?? '', from, to, generated_at: new Date().toISOString(), members, purchases, member_money, processing, lots, sales, safety }
  }

  private async section<T>(name: string, load: () => Promise<T>): Promise<T | null> {
    try {
      return await load()
    } catch (error) {
      logger.error(`Season report section ${name} failed`, { error })
      return null
    }
  }

  private async purchases(htxProfileId: string, range: ReportRange) {
    const p = await this.source.purchases(htxProfileId, range)
    const sum = (rows: { net_kg: number; amount_vnd: bigint; tickets: number }[]) => ({
      net_kg: round(rows.reduce((n, r) => n + r.net_kg, 0), 1),
      amount_vnd: rows.reduce((n, r) => n + r.amount_vnd, BigInt(0)).toString(),
      tickets: rows.reduce((n, r) => n + r.tickets, 0),
    })
    return {
      total: sum(p.months),
      months: p.months.map((m) => ({ ...m, amount_vnd: m.amount_vnd.toString() })),
      by_grade: p.by_grade.map((g) => ({ ...g, amount_vnd: g.amount_vnd.toString() })),
    }
  }
}
