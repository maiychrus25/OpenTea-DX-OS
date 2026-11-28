// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SeasonReport } from '@/domain/report/views'
import { SeasonReportUseCase } from '@/application/report/SeasonReportUseCase'
import { PrismaReportSource } from '@/infrastructure/db/report/PrismaReportSource'

/** The season report's one data step for the two report pages; each section that fails comes back null. */
export async function loadSeasonReport(htxProfileId: string, from: string, to: string, htxName: string, _now: Date): Promise<SeasonReport> {
  const report = await new SeasonReportUseCase(new PrismaReportSource()).read(htxProfileId, from, to)
  // The use case leaves the name empty when its lookup fails; the page already knows it.
  return { ...report, htx_name: report.htx_name || htxName }
}
