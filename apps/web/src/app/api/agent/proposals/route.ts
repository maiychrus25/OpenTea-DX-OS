// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAction, type ApproverRole } from '@/application/agent/action-catalog'
import { ListProposalsUseCase } from '@/application/agent/ListProposalsUseCase'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
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

async function resolveJournalSubjects(
  kind: string,
  evidenceRows: { table: string; id: string }[],
  journalRepo: PrismaJournalRepository,
  guard: TenantGuard
): Promise<{ id: string; label: string }[]> {
  if (!kind.startsWith('journal.')) return []
  const ids = Array.from(
    new Set(evidenceRows.filter((r) => r.table === 'journal_entries').map((r) => r.id))
  )
  const subjects: { id: string; label: string }[] = []
  for (const id of ids) {
    try {
      await guard.journalEntry(id)
      const entry = await journalRepo.findById(id)
      if (!entry) continue
      const parcelLabel = entry.parcel_code || entry.parcel_id
      const dateStr = formatDayMonth(
        entry.entry_date instanceof Date ? entry.entry_date : new Date(entry.entry_date)
      )
      subjects.push({
        id,
        label: `Thửa ${parcelLabel} · ${entry.activity_type} · ${dateStr}`,
      })
    } catch {
      // Foreign or deleted entry IDs are omitted from subject enrichment.
    }
  }
  return subjects
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

  const journalRepo = new PrismaJournalRepository()
  const guard = new TenantGuard(tenant)

  const data = await Promise.all(
    proposals.map(async (p) => {
      const def = getAction(p.kind)
      const subjects = await resolveJournalSubjects(p.kind, p.evidence?.rows ?? [], journalRepo, guard)
      return {
        ...p,
        titleVi: def?.titleVi ?? p.kind,
        preview: def ? def.preview(p.payload) : [],
        canDecide: Boolean(def && def.approverRoles.includes(tenant.role as ApproverRole)),
        subjects,
      }
    })
  )

  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getAgentProposals)
