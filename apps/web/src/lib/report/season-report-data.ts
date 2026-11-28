// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SeasonReport } from '@/domain/report/views'

/**
 * The season report's one data step for the two report pages.
 * TODO(integration): SeasonReportUseCase (phase 3 R1): return new SeasonReportUseCase(new PrismaReportSource()).read(htxProfileId, from, to).
 * Until it lands every section is null, so each section shows "Chưa tải được phần này" and the page still renders.
 */
export async function loadSeasonReport(_htxProfileId: string, from: string, to: string, htxName: string, now: Date): Promise<SeasonReport> {
  return {
    htx_name: htxName,
    from,
    to,
    generated_at: now.toISOString(),
    members: null,
    purchases: null,
    member_money: null,
    processing: null,
    lots: null,
    sales: null,
    safety: null,
  }
}
