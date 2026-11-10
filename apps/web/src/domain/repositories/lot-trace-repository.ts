// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceData } from '../entities/lot-trace-data'

/** The harvest dates of every crop cycle of one parcel of a lot. */
export interface ParcelHarvests {
  parcel_code: string
  harvested_at: Date[]
}

export interface LotTraceRepository {
  getLotByCode(lot_code: string): Promise<LotTraceData | null>
  /** One row per parcel of the lot; kept out of the trace data so the public page snapshot is unchanged. */
  getParcelHarvests(lot_code: string): Promise<ParcelHarvests[]>
}
