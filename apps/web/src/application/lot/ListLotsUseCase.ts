// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort, LotFilters } from '@/domain/lot/ports/LotPort'

export class ListLotsUseCase {
  constructor(private readonly lotPort: LotPort) {}

  async execute(filters: LotFilters) {
    return this.lotPort.findAll(filters)
  }
}
