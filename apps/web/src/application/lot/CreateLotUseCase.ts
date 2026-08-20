// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort, CreateLotData } from '@/domain/lot/ports/LotPort'

export class CreateLotUseCase {
  constructor(private readonly lotPort: LotPort) {}

  async execute(data: CreateLotData) {
    return this.lotPort.create(data)
  }
}
