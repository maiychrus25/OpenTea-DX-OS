// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/officer/diseases`: reports waiting for a person, newest first, with no photo link. */
export const diseasesTool: ChatTool = {
  name: 'diseases',
  titleVi: 'Báo cáo bệnh',
  roles: ['officer', 'manager'],
  routes: ['GET /api/officer/diseases'],
  args: [],
  async run(user) {
    const reports = await prisma.diseaseReport.findMany({
      where: { status: 'PENDING', household: { htx_profile_id: user.tenant.htxProfileId } },
      orderBy: { detection_date: 'desc' },
      take: 10,
      select: {
        detection_date: true,
        ai_disease_name: true,
        ai_confidence: true,
        parcel: { select: { parcel_code: true } },
        household: { select: { name: true } },
      },
    })
    return reply(
      'Báo cáo bệnh',
      reports.map(
        (report) =>
          `${formatVnDate(report.detection_date) ?? '—'} · ${report.parcel.parcel_code} · ${report.household.name} · ${report.ai_disease_name} (${Math.round(report.ai_confidence * 100)}%)`
      )
    )
  },
}
