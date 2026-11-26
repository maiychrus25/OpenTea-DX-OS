// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { evidenceForSubjects } from '@/application/agent/evidence-for-subjects'
import { ForbiddenError, ValidationError } from '@/domain/errors'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import type { Tenant } from '@/lib/api/tenant'

export interface McpProposalInput {
  kind: string
  payload: Record<string, unknown>
  reasonVi: string
}

/**
 * Creates a proposal the person asked for through MCP (M14 contract C1). It only creates: the proposal stays
 * `proposed` until someone with the approver role decides it through DecideProposalUseCase.
 */
export async function createMcpProposal(tenant: Tenant, input: McpProposalInput, now = new Date()): Promise<{ id: string } | null> {
  const definition = getAction(input.kind)
  if (!definition) throw new ValidationError('UNKNOWN_KIND')
  if (!definition.origins.includes('user')) throw new ValidationError('INVALID_ORIGIN')
  if (!(definition.approverRoles as readonly string[]).includes(tenant.role)) throw new ForbiddenError('NOT_AN_APPROVER')

  const evidence = await evidenceForSubjects(input.kind, input.payload, tenant.htxCode)
  return new CreateProposalUseCase(new PrismaProposalRepository()).execute({
    htxCode: tenant.htxCode,
    agent: 'mcp',
    kind: input.kind,
    payload: input.payload,
    reasonVi: input.reasonVi,
    evidence,
    origin: 'user',
    requestedBy: tenant.userId,
    channel: 'mcp',
    now,
  })
}
