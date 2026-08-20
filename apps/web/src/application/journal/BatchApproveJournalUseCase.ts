// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort } from '@/domain/journal/ports/JournalPort'

export class BatchApproveJournalUseCase {
  constructor(private readonly journalPort: JournalPort) {}

  async execute(entryIds: string[], approvedById: string) {
    return this.journalPort.batchApprove(entryIds, approvedById)
  }
}
