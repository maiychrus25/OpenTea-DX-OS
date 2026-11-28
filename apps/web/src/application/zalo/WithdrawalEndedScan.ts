// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { weighingBlock, viDate } from '@/application/weighing/withdrawal-gate'
import { countsTowardWithdrawal } from '@/domain/journal/withdrawal-status'
import type { SprayEntry } from '@/domain/journal/blocking-sprays'
import type { ZaloEvent } from '@/domain/zalo/zalo-events'
import type { ZaloEventSink } from './zalo-events'

export interface WithdrawalCandidate {
  parcelId: string
  parcelCode: string
  householdId: string
  htxCode: string
  /** Every counted spraying of the parcel done by the end of the day, with its safe dates. */
  entries: SprayEntry[]
}

export interface WithdrawalScanPort {
  /** Parcels with a counted spraying whose safe date falls on the Vietnam `day`. */
  candidates(day: string): Promise<WithdrawalCandidate[]>
}

/**
 * Finds the parcels whose withdrawal ends today (Vietnam day) and tells their households. A parcel counts when no counted
 * spraying still blocks it after today (rule (a), the weighing gate's own check) and one of them ends today. The event key is
 * parcel and day, so the relay's tick every five minutes queues each parcel once.
 */
export class WithdrawalEndedScan {
  constructor(
    private readonly sink: ZaloEventSink,
    private readonly port: WithdrawalScanPort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Returns how many messages were newly queued. */
  async run(): Promise<number> {
    const day = vnDayOf(this.clock())
    const events: ZaloEvent[] = []
    for (const parcel of await this.port.candidates(day)) {
      if (weighingBlock(parcel.entries, day) !== null) continue
      const endsToday = parcel.entries.some(
        (entry) => countsTowardWithdrawal(entry.status) && entry.activities.some((a) => a.safe_harvest_date && vnDayOf(new Date(a.safe_harvest_date)) === day),
      )
      if (!endsToday) continue
      events.push({
        kind: 'WITHDRAWAL_ENDED',
        htxCode: parcel.htxCode,
        eventId: `${parcel.parcelId}:${day}`,
        householdId: parcel.householdId,
        params: { parcel_code: parcel.parcelCode, safe_date: viDate(day) },
      })
    }
    if (events.length === 0) return 0
    return (await this.sink.enqueue(events)).queued
  }
}
