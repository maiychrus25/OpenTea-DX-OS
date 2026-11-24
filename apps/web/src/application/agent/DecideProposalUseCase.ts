// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { DecisionChannel, ProposalStatus } from '@/domain/agent/proposal'
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'
import { getAction, type ActionDefinition, type ApproverRole } from './action-catalog'
import type { EvidenceLoaders } from './actions/journal-evidence'

const GENERIC_EXECUTION_FAILURE = 'Không thể thực hiện đề xuất. Vui lòng thử lại sau.'

export interface DecideProposalInput {
  proposalId: string
  tenant: Tenant
  userName: string
  decision: 'approve' | 'reject'
  note?: string
  editedPayload?: Record<string, unknown>
  channel: DecisionChannel
  now?: Date
}

export type DecideProposalOutcome =
  | { outcome: 'executed'; result: Record<string, unknown> }
  | { outcome: 'failed'; error: string }
  | { outcome: 'rejected' }
  | { outcome: 'stale' }
  | { outcome: 'expired' }
  | { outcome: 'already_decided'; by: string | null; at: Date | null; status: ProposalStatus }

export class DecideProposalUseCase {
  constructor(
    private readonly repo: Pick<
      ProposalRepository,
      'findById' | 'claim' | 'markRejected' | 'markStale' | 'markExpired' | 'markExecuted' | 'markFailed'
    >,
    private readonly loaders?: EvidenceLoaders,
    private readonly runExecute?: (
      definition: ActionDefinition<any>,
      payload: Record<string, unknown>,
      tenant: Tenant
    ) => Promise<Record<string, unknown>>
  ) {}

  async execute(input: DecideProposalInput): Promise<DecideProposalOutcome> {
    const proposal = await this.repo.findById(input.tenant.htxCode, input.proposalId)
    if (!proposal) {
      throw new NotFoundError('Không tìm thấy đề xuất')
    }

    const definition = getAction(proposal.kind)
    if (!definition) {
      throw new ValidationError('UNKNOWN_KIND')
    }

    if (!definition.approverRoles.includes(input.tenant.role as ApproverRole)) {
      throw new ForbiddenError('Bạn không có quyền duyệt loại đề xuất này')
    }

    if (proposal.status !== 'proposed') {
      return {
        outcome: 'already_decided',
        by: proposal.decidedByName,
        at: proposal.decidedAt,
        status: proposal.status,
      }
    }

    const now = input.now ?? new Date()
    if (proposal.expiresAt.getTime() <= now.getTime()) {
      const changed = await this.repo.markExpired(input.tenant.htxCode, proposal.id, { actorId: input.tenant.userId })
      return changed ? { outcome: 'expired' } : this.readConflict(input.tenant.htxCode, proposal.id)
    }

    if (input.decision === 'reject') {
      const note = input.note?.trim() ?? ''
      if (!note || note.length > 500) {
        throw new ValidationError('Vui lòng nhập lý do từ chối (từ 1 đến 500 ký tự)')
      }
      const rejected = await this.repo.markRejected(input.tenant.htxCode, proposal.id, {
        userId: input.tenant.userId,
        userName: input.userName,
        role: input.tenant.role,
        channel: input.channel,
        note,
        editedPayload: null,
      })
      if (!rejected) {
        return this.readConflict(input.tenant.htxCode, proposal.id)
      }
      return { outcome: 'rejected' }
    }

    let effectiveRaw: Record<string, unknown> = { ...proposal.payload }
    let editedForDb: Record<string, unknown> | null = null
    if (input.editedPayload && Object.keys(input.editedPayload).length > 0) {
      for (const key of Object.keys(input.editedPayload)) {
        if (!definition.editableFields.includes(key)) {
          throw new ValidationError(`Trường '${key}' không được phép chỉnh sửa`)
        }
      }
      effectiveRaw = { ...effectiveRaw, ...input.editedPayload }
      editedForDb = input.editedPayload
    }

    const parsedPayload = definition.payloadSchema.safeParse(effectiveRaw)
    if (!parsedPayload.success) {
      throw new ValidationError('INVALID_PAYLOAD')
    }

    const stale = await definition.isStale(parsedPayload.data, proposal.evidence, {
      htxCode: input.tenant.htxCode,
      loaders: this.loaders,
    })
    if (stale) {
      const changed = await this.repo.markStale(input.tenant.htxCode, proposal.id, { actorId: input.tenant.userId })
      // Nothing changed means someone decided it first, which is the more useful answer.
      return changed ? { outcome: 'stale' } : this.readConflict(input.tenant.htxCode, proposal.id)
    }

    const claimed = await this.repo.claim(input.tenant.htxCode, proposal.id, {
      userId: input.tenant.userId,
      userName: input.userName,
      role: input.tenant.role,
      channel: input.channel,
      note: input.note?.trim() || null,
      editedPayload: editedForDb,
    })
    if (!claimed) {
      return this.readConflict(input.tenant.htxCode, proposal.id)
    }

    const audit = {
      actorId: input.tenant.userId,
      agent: proposal.agent,
      kind: proposal.kind,
      subjectIds: definition.subjects(parsedPayload.data),
    }
    let result: Record<string, unknown>
    try {
      const executor = this.runExecute ?? ((def, payload, approver) => def.execute(payload, approver))
      result = await executor(definition, parsedPayload.data, input.tenant)
    } catch (err) {
      // Domain errors are meant for the user; anything else is logged and shown as a generic message.
      const message = err instanceof DomainError ? err.message : GENERIC_EXECUTION_FAILURE
      if (!(err instanceof DomainError)) {
        console.error('[DecideProposal] execution failed for proposal', proposal.id, err)
      }
      await this.repo.markFailed(proposal.id, message, audit)
      return { outcome: 'failed', error: message }
    }

    // The journal change is already committed; a bookkeeping error must not turn it into a failure answer.
    try {
      await this.repo.markExecuted(proposal.id, result, audit)
    } catch (err) {
      console.error('[DecideProposal] could not record execution of proposal', proposal.id, err)
    }
    return { outcome: 'executed', result }
  }

  private async readConflict(htxCode: string, proposalId: string): Promise<DecideProposalOutcome> {
    const latest = await this.repo.findById(htxCode, proposalId)
    return {
      outcome: 'already_decided',
      by: latest?.decidedByName ?? null,
      at: latest?.decidedAt ?? null,
      status: latest?.status ?? 'approved',
    }
  }
}
