// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DryStockByGrade, PricesToday } from '@/domain/board/views'

/** Raw figures of the director board. Every method is one HTX only, and reads aggregates, never row lists. */
export interface BoardSource {
  /** VALID tickets weighed in [from, to). */
  leafBetween(htxProfileId: string, from: Date, to: Date): Promise<{ net_kg: number; amount_vnd: bigint; tickets: number }>
  prices(htxProfileId: string, day: string): Promise<PricesToday>
  payable(htxProfileId: string): Promise<{ unpaid_lines_vnd: bigint; unsettled_leaf_vnd: bigint; unsettled_advances_vnd: bigint }>
  dryStock(htxProfileId: string): Promise<DryStockByGrade[]>
  /** Parcels blocked by rule (a) at the end of the Vietnam day `day`. */
  parcelsInWithdrawal(htxProfileId: string, day: string): Promise<number>
  /** FINISHED batches out of band with finished_at at or after `since`. */
  outOfBandBatchesSince(htxProfileId: string, since: Date): Promise<number>
  /** OPEN batches with processed_on on or before the Vietnam day `day`. */
  openBatchesOnOrBefore(htxProfileId: string, day: string): Promise<number>
  /** Stock rows with kg left and processed_on on or before the Vietnam day `day`. */
  stockRowsOnOrBefore(htxProfileId: string, day: string): Promise<number>
  draftPeriods(htxProfileId: string): Promise<{ id: string; code: string }[]>
  /** Unpaid lines (payable above zero) of CLOSED periods closed before `before`. */
  unpaidLinesClosedBefore(htxProfileId: string, before: Date): Promise<number>
}
