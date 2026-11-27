// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { loadJournalSubjects } from '@/application/agent/journal-subjects'
import { ListProposalsUseCase } from '@/application/agent/ListProposalsUseCase'
import { type ApproverRole, ensureAppActions, getAction } from '@/application/agent/action-catalog'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import type { ChatTool } from '../types'
import { reply } from './common'

const MAX_PROPOSALS = 5

/** Routes: `GET /api/agent/proposals` (open view); only the kinds this role may approve are listed. */
export const pendingTool: ChatTool = {
  name: 'pending',
  titleVi: 'Việc cần duyệt',
  roles: ['officer', 'manager'],
  routes: ['GET /api/agent/proposals'],
  args: [],
  async run(user) {
    const role = user.tenant.role as ApproverRole
    const open = await new ListProposalsUseCase(new PrismaProposalRepository()).execute(user.tenant.htxCode, { view: 'open' })
    await ensureAppActions(open.map((proposal) => proposal.kind))
    const approvable = open
      .filter((proposal) => getAction(proposal.kind, user.tenant.htxCode)?.approverRoles.includes(role))
      .slice(0, MAX_PROPOSALS)
    const labels = await loadJournalSubjects(approvable, user.tenant.htxProfileId)
    const lines = approvable.map((proposal) => {
      const def = getAction(proposal.kind, user.tenant.htxCode)!
      return `• ${def.titleVi}: ${def.preview(proposal.payload, labels, proposal.evidence).join(' · ')}`
    })
    return reply(
      'Đề xuất AI',
      lines,
      approvable.map((proposal) => proposal.id)
    )
  },
}
