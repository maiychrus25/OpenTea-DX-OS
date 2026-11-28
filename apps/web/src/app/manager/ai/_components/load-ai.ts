// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { forecastForHtx } from '@/lib/forecast/forecast-page'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { localDay } from '@/domain/shared/local-day'
import { vnDayStart } from '@/application/agent/campaign/vn-day'
import type { AiData } from './AiOverview'

/** One figure that cannot be read leaves a dash, never the whole page. */
async function orElse<T>(read: () => PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

export async function loadAiOverview(htxProfileId: string, htxCode: string): Promise<AiData> {
  const now = new Date()
  const today = localDay(now)
  const [year, month] = today.split('-').map(Number)
  // The first day of each of the last six months, oldest first.
  const starts = Array.from({ length: 6 }, (_, i) => localDay(new Date(Date.UTC(year, month - 6 + i, 1, 12))))
  const [forecast, tickets, price, proposals] = await Promise.all([
    orElse(() => forecastForHtx(htxCode), null),
    orElse(() => prisma.freshLeafTicket.findMany({ where: { htx_profile_id: htxProfileId, status: 'VALID', weighed_at: { gte: vnDayStart(starts[0]) } }, select: { weighed_at: true, net_kg: true } }), []),
    orElse(() => prisma.dailyLeafPrice.findFirst({ where: { htx_profile_id: htxProfileId }, orderBy: [{ price_date: 'desc' }, { price_vnd_per_kg: 'desc' }], select: { price_vnd_per_kg: true } }), null),
    orElse<Proposal[]>(() => new PrismaProposalRepository().list(htxCode, { statuses: ['proposed'], limit: 4 }), []),
  ])
  const dates = (forecast?.parcels ?? []).map((p) => p.harvest_on).sort()
  return {
    forecastKg: forecast ? forecast.total_fresh_kg : null,
    harvest: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    price: price?.price_vnd_per_kg ?? null,
    months: starts.map((start) => ({
      label: `T${Number(start.slice(5, 7))}/${start.slice(0, 4)}`,
      kg: Math.round(tickets.filter((t) => localDay(t.weighed_at).slice(0, 7) === start.slice(0, 7)).reduce((sum, t) => sum + Number(t.net_kg), 0) * 10) / 10,
    })),
    suggestions: proposals.map((p) => ({ id: p.id, title: p.reasonVi, reason: `Đề xuất ngày ${localDay(p.createdAt).split('-').reverse().join('/')}` })),
  }
}
