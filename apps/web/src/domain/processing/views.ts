// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import type { DryTeaGrade } from './grades'

export type BatchStatus = 'OPEN' | 'FINISHED' | 'CANCELLED'

/** A batch as the API shows it. Days are `YYYY-MM-DD`; kg have one decimal. */
export interface BatchView {
  id: string
  batch_code: string
  processed_on: string
  status: BatchStatus
  master_name: string | null
  shift: string | null
  notes: string | null
  ticket_count: number
  fresh_kg: number
  dry_kg: number
  recovery_ratio: number | null
  out_of_band: boolean
  deviation_note: string | null
  created_at: string
  finished_at: string | null
  cancel_reason: string | null
}

export interface BatchOutputView {
  id: string
  grade: DryTeaGrade
  kg: number
  remaining_kg: number
}

export interface BatchDetail {
  batch: BatchView
  tickets: TicketView[]
  outputs: BatchOutputView[]
  preview: { fresh_kg: number; dry_kg: number; recovery_ratio: number | null; out_of_band: boolean }
}
