// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort } from '@/domain/lot/ports/LotPort'

export class GetLotUseCase {
  constructor(private readonly lotPort: Pick<LotPort, 'findById'>) {}

  async execute(id: string) {
    return this.lotPort.findById(id)
  }
}
