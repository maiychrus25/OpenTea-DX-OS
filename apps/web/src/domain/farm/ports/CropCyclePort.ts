// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { HarvestEvent } from '../entities/HarvestEvent'

export interface CropCyclePort {
  getHarvestSchedule(htxProfileId: string, startDate: string, endDate: string): Promise<HarvestEvent[]>
  updateEstimatedHarvestDate(cycleId: string, newDate: string): Promise<void>
  getUnscheduledActiveCycles(htxProfileId: string): Promise<HarvestEvent[]>
  /** Moves a HARVESTED parcel to TENDING and opens its next round, atomically; null when the parcel is not HARVESTED. */
  startNextRound(parcelId: string): Promise<{ cycleId: string; season: string } | null>
}
