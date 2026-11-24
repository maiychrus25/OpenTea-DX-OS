// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal, ProposalStatus } from '@/domain/agent/proposal'

export type ProposalListView = 'open' | 'history'

const OPEN_STATUSES: ProposalStatus[] = ['proposed']
const HISTORY_STATUSES: ProposalStatus[] = ['approved', 'executed', 'failed', 'rejected', 'expired', 'stale']

export class ListProposalsUseCase {
  constructor(private readonly repo: Pick<ProposalRepository, 'list'>) {}

  async execute(
    htxCode: string,
    options: { view: ProposalListView; kind?: string; limit?: number }
  ): Promise<Proposal[]> {
    const statuses = options.view === 'open' ? OPEN_STATUSES : HISTORY_STATUSES
    return this.repo.list(htxCode, {
      statuses,
      kind: options.kind?.trim() || undefined,
      limit: options.limit ?? 100,
    })
  }
}
