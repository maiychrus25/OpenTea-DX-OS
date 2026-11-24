// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAction, type ApproverRole } from '@/application/agent/action-catalog'
import { ListProposalsUseCase } from '@/application/agent/ListProposalsUseCase'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

function formatDayMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(date)
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${day}/${month}`
}

function journalEntryIds(proposal: Proposal): string[] {
  if (!proposal.kind.startsWith('journal.')) return []
  return proposal.evidence?.rows?.filter((r) => r.table === 'journal_entries').map((r) => r.id) ?? []
}

/** One scoped query for every journal entry the listed proposals mention; foreign or deleted ids get no label. */
async function loadJournalSubjects(
  proposals: Proposal[],
  htxProfileId: string
): Promise<Map<string, { id: string; label: string }>> {
  const ids = Array.from(new Set(proposals.flatMap(journalEntryIds)))
  const entries = await new PrismaJournalRepository().findManyScoped(ids, htxProfileId)
  return new Map(
    entries.map((entry) => {
      const parcelLabel = entry.parcel_code || entry.parcel_id
      const dateStr = formatDayMonth(
        entry.entry_date instanceof Date ? entry.entry_date : new Date(entry.entry_date)
      )
      return [entry.id, { id: entry.id, label: `Thửa ${parcelLabel} · ${entry.activity_type} · ${dateStr}` }]
    })
  )
}

async function getAgentProposals(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  const view = url.searchParams.get('view') === 'history' ? 'history' : 'open'
  const kind = url.searchParams.get('kind') || undefined

  const proposals = await new ListProposalsUseCase(new PrismaProposalRepository()).execute(tenant.htxCode, {
    view,
    kind,
  })

  const labels = await loadJournalSubjects(proposals, tenant.htxProfileId)

  const data = proposals.map((p) => {
    const def = getAction(p.kind)
    const subjects = Array.from(new Set(journalEntryIds(p)))
      .map((id) => labels.get(id))
      .filter((subject): subject is { id: string; label: string } => Boolean(subject))
    return {
      ...p,
      titleVi: def?.titleVi ?? p.kind,
      preview: def ? def.preview(p.payload) : [],
      canDecide: Boolean(def && def.approverRoles.includes(tenant.role as ApproverRole)),
      subjects,
    }
  })

  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getAgentProposals)
