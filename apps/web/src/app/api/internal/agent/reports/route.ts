// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { telegramNotifier } from '@/application/telegram/telegram-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const count = z.number().int().min(0).max(1_000_000).optional()

// The agent sends counts only; proposal figures are counted by the web and sensor alerts are not reported.
const reportSchema = z.object({
  kind: z.enum(['daily', 'weekly']),
  period_start: z.string().regex(DAY_RE),
  period_end: z.string().regex(DAY_RE),
  figures: z.object({
    journals_new: count,
    journals_approved: count,
    journals_pending: count,
    disease_reports: count,
    lots_created: count,
  }),
})

async function postAgentReport(request: Request) {
  const caller = await requireAgentCaller(request)
  const body = reportSchema.parse(await request.json().catch(() => null))
  const queued = await telegramNotifier().enqueueReport(
    caller.htxCode,
    body.kind,
    body.period_start,
    body.period_end,
    body.figures
  )
  return NextResponse.json({ data: { queued } }, { status: queued ? 201 : 200 })
}

export const POST = withErrorHandler(postAgentReport)
