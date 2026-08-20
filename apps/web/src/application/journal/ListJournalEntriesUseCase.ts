// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort, JournalFilters } from '@/domain/journal/ports/JournalPort'

export class ListJournalEntriesUseCase {
  constructor(private readonly journalPort: JournalPort) {}

  async execute(filters: JournalFilters) {
    return this.journalPort.findAll(filters)
  }
}
