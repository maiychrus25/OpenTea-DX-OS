// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import type { DryTeaGrade } from '@/domain/processing/grades'
import type { BatchDetail, BatchStatus, BatchView } from '@/domain/processing/views'

export interface NewBatch {
  htxProfileId: string
  batchCode: string
  processedOn: string
  masterName: string | null
  shift: string | null
  notes: string | null
  createdById: string
}

export interface BatchOutputInput {
  grade: DryTeaGrade
  kg: number
}

/** The reads and writes of one batch transaction. A mutating call locks the batch first and keeps it locked to the end. */
export interface BatchUnit {
  /** Takes the numbering lock of the HTX and day, then returns the next `{CODE}-MS-{YYYYMMDD}-{NN}`. */
  nextBatchCode(htxCode: string, day: string): Promise<string>
  insert(batch: NewBatch): Promise<string>
  /** Locks the batch row (`FOR UPDATE`); null when it is not the HTX's. */
  lock(htxProfileId: string, id: string): Promise<{ id: string; batch_code: string; status: BatchStatus } | null>
  /** One conditional write (VALID, same HTX, not in a batch); returns how many tickets it took. */
  attachTickets(htxProfileId: string, batchId: string, ticketIds: string[]): Promise<number>
  /** Returns how many tickets it released (0 when the ticket is not in this batch). */
  detachTicket(batchId: string, ticketId: string): Promise<number>
  replaceOutputs(batchId: string, outputs: BatchOutputInput[]): Promise<void>
  totals(batchId: string): Promise<{ ticketNetKg: string[]; outputKg: string[] }>
  finish(batchId: string, input: { freshKg: number; dryKg: number; ratio: number; outOfBand: boolean; deviationNote: string | null; userId: string; at: Date }): Promise<void>
  /** Marks the batch cancelled and gives every ticket back. */
  cancel(batchId: string, input: { reason: string; userId: string; at: Date }): Promise<void>
  detail(batchId: string): Promise<BatchDetail>
  view(batchId: string): Promise<BatchView>
}

export interface BatchFilter {
  status?: BatchStatus
  from?: string
  to?: string
}

export interface BatchPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: BatchUnit) => Promise<T>): Promise<T>
  list(htxProfileId: string, filter: BatchFilter): Promise<BatchView[]>
  get(htxProfileId: string, id: string): Promise<BatchDetail | null>
  /** Valid tickets of the HTX that are in no batch, weighed from the start of `fromDay` to the end of `toDay` (Vietnam days). */
  availableTickets(htxProfileId: string, fromDay: string, toDay: string): Promise<TicketView[]>
}
