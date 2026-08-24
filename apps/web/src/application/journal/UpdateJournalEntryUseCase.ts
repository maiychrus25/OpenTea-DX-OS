// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { NotFoundError, DomainError, ForbiddenError } from '@/domain/errors'

export class UpdateJournalEntryUseCase {
  constructor(private readonly journalPort: JournalPort) {}

  async execute(id: string, data: Record<string, unknown>, userRole?: string, userHouseholdId?: string) {
    const existing = await this.journalPort.findById(id)
    if (!existing) throw new NotFoundError('Journal entry not found')
    if (userRole === 'FARMER') {
      if (!userHouseholdId || existing.household_id !== userHouseholdId) {
        throw new ForbiddenError('Bạn không có quyền sửa nhật ký này')
      }
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
      throw new DomainError('Only draft/pending entries can be updated')
    }
    return this.journalPort.update(id, data as any)
  }
}
