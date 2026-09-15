// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface HarvestEvent {
  cycleId: string
  parcelId: string
  parcelName: string | null
  householdName: string
  cropType: string
  estimatedYieldKg: number | null
  estimatedHarvestDate: string | null
  safeHarvestDate: string | null
  status: 'SAFE' | 'WARNING' | 'DANGER'
}
