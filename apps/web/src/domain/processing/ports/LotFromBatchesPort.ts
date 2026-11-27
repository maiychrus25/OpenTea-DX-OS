// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SprayEntry } from '@/domain/journal/blocking-sprays'
import type { LotSummary } from '@/domain/lot/ports/LotPort'
import type { DryTeaGrade } from '@/domain/processing/grades'
import type { SourceTicket } from '@/domain/processing/lot-sources'
import type { BatchStatus } from '@/domain/processing/views'

/** A dry tea output of a finished batch with what is left of it. Days are `YYYY-MM-DD`; kg have one decimal. */
export interface DryStockRow {
  output_id: string
  batch_id: string
  batch_code: string
  processed_on: string
  grade: DryTeaGrade
  kg: number
  remaining_kg: number
  recovery_ratio: number
  out_of_band: boolean
}

/** An output row held under lock, with the kg that lots have already taken from it. */
export interface LockedOutput {
  id: string
  htx_profile_id: string
  grade: DryTeaGrade
  kg: number
  taken_kg: number
  batch_status: BatchStatus
}

export interface NewLotFromBatches {
  htxProfileId: string
  htxCode: string
  createdById: string
  grade: DryTeaGrade
  gradeLabel: string
  /** The latest weigh day of the source tickets, `YYYY-MM-DD`. */
  harvestDay: string
  totalKg: number
  packagingType: string | null
  destination: string | null
  buyerName: string | null
  /** One line per parcel with a source ticket; the cycle is the one of its latest ticket. */
  parcelLines: { parcel_id: string; cycle_id: string | null }[]
  sources: { output_id: string; kg: number }[]
}

/** The reads and the write of one lot transaction. The output rows stay locked until it ends. */
export interface LotFromBatchesUnit {
  /** Locks the outputs (`FOR UPDATE`, in id order) and reads what was taken from them afterwards; foreign or missing ids are absent. */
  lockOutputs(htxProfileId: string, outputIds: string[]): Promise<LockedOutput[]>
  stock(htxProfileId: string, grade: DryTeaGrade | undefined): Promise<DryStockRow[]>
  sourceTickets(outputIds: string[]): Promise<SourceTicket[]>
  sprayEntries(parcelIds: string[]): Promise<Record<string, SprayEntry[]>>
  createLot(lot: NewLotFromBatches): Promise<LotSummary & { dry_grade: DryTeaGrade }>
}

export interface LotFromBatchesPort {
  inTransaction<T>(ctx: { actorId: string }, work: (unit: LotFromBatchesUnit) => Promise<T>): Promise<T>
  stock(htxProfileId: string, grade: DryTeaGrade | undefined): Promise<DryStockRow[]>
}
