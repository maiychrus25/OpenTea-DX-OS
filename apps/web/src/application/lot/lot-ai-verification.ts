// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import type { HarvestDecision, LotVerificationRepository } from '@/domain/repositories/lot-verification-repository'

const ROLE_LABEL: Record<string, string> = { officer: 'cán bộ', manager: 'trưởng HTX' }
const MAX_LINES = 3

/**
 * The public lot page's verification line (M14 contract C4). A line appears only when the AI decision's audit event
 * exists, its evidence hash equals the proposal's, and the audit chain is intact up to it. Names are never shown.
 */
export class LotAiVerification {
  constructor(private readonly repo: LotVerificationRepository) {}

  async execute(lotCode: string): Promise<string[]> {
    const matching = (await this.repo.findHarvestDecisions(lotCode)).filter(isVerifiable)
    const distinct = Array.from(new Map(matching.map((d) => [d.eventId, d])).values()).slice(0, MAX_LINES)
    if (distinct.length === 0) return []

    const newest = distinct.reduce((max, d) => (BigInt(d.eventId) > BigInt(max) ? d.eventId : max), distinct[0].eventId)
    if (!(await this.repo.auditChainIntactThrough(newest))) return []

    return distinct.map(
      (d) => `AI đề xuất, ${ROLE_LABEL[d.role as string]} đã duyệt ngày ${formatVnDate(d.decidedAt)}, kiểm chứng trong sổ audit`
    )
  }
}

function isVerifiable(decision: HarvestDecision): boolean {
  return (
    decision.proposalEvidenceSha256 !== null &&
    decision.eventEvidenceSha256 === decision.proposalEvidenceSha256 &&
    Object.prototype.hasOwnProperty.call(ROLE_LABEL, decision.role ?? '')
  )
}
