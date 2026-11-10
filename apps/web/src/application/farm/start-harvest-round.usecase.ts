// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CropCyclePort } from '@/domain/farm/ports/CropCyclePort'
import { DomainError } from '@/domain/errors'

/** Opens the next tea harvest round (`Lứa <n>/<year>`) on a parcel whose current round was harvested. */
export class StartHarvestRoundUseCase {
  constructor(private readonly cropCyclePort: CropCyclePort) {}

  // _officerId: the cycle has no column for who opened it; the route already checked the role.
  async execute(parcelId: string, _officerId: string): Promise<{ cycleId: string; season: string }> {
    const round = await this.cropCyclePort.startNextRound(parcelId)
    if (!round) throw new DomainError('Chỉ bắt đầu lứa mới khi thửa đã thu hoạch')
    return round
  }
}
