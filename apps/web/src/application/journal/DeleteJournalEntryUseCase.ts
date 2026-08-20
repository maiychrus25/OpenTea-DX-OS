// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { NotFoundError, DomainError } from '@/domain/errors'

export class DeleteJournalEntryUseCase {
  constructor(private readonly journalPort: JournalPort) {}

  async execute(id: string) {
    const existing = await this.journalPort.findById(id)
    if (!existing) throw new NotFoundError('Journal entry not found')
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
      throw new DomainError('Only draft/pending entries can be deleted')
    }
    return this.journalPort.delete(id)
  }
}
