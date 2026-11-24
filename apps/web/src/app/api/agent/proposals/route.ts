// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAction, type ApproverRole } from '@/application/agent/action-catalog'
import { ListProposalsUseCase } from '@/application/agent/ListProposalsUseCase'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { type JournalSubject } from '@/application/agent/actions/journal-labels'
import { journalEntryIds, loadJournalSubjects } from '@/application/agent/journal-subjects'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

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
      .filter((subject): subject is JournalSubject => Boolean(subject))
    return {
      ...p,
      titleVi: def?.titleVi ?? p.kind,
      preview: def ? def.preview(p.payload, labels) : [],
      canDecide: Boolean(def && def.approverRoles.includes(tenant.role as ApproverRole)),
      editableFields: def?.editableFields ?? [],
      subjects,
    }
  })

  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getAgentProposals)
