// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { CropCyclePort } from '../../domain/farm/ports/CropCyclePort'

export class UpdateHarvestDateUseCase {
  constructor(private readonly cropCyclePort: CropCyclePort) {}

  async execute(cycleId: string, newDate: string): Promise<void> {
    return this.cropCyclePort.updateEstimatedHarvestDate(cycleId, newDate)
  }
}
