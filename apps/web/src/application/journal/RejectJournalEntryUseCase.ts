// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ValidationError } from '@/domain/errors'
import type { JournalPort, JournalReviewDecision } from '@/domain/journal/ports/JournalPort'

export interface RejectJournalEntryInput {
  decision: JournalReviewDecision
  reason: string
  reviewerId: string
}

/** Reject or request changes on a pending journal entry and notify the submitting farmer. */
export class RejectJournalEntryUseCase {
  constructor(private readonly journalPort: Pick<JournalPort, 'review'>) {}

  async execute(entryId: string, input: RejectJournalEntryInput): Promise<{ status: JournalReviewDecision }> {
    const reason = input.reason.trim()
    if (!reason || reason.length > 500) {
      throw new ValidationError('Lý do từ chối phải từ 1 đến 500 ký tự')
    }
    return this.journalPort.review(entryId, input.decision, reason, input.reviewerId)
  }
}
