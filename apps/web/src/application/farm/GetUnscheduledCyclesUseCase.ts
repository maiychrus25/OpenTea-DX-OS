// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { CropCyclePort } from '../../domain/farm/ports/CropCyclePort'
import { HarvestEvent } from '../../domain/farm/entities/HarvestEvent'

export class GetUnscheduledCyclesUseCase {
  constructor(private readonly cropCyclePort: CropCyclePort) {}

  async execute(): Promise<HarvestEvent[]> {
    return this.cropCyclePort.getUnscheduledActiveCycles()
  }
}
