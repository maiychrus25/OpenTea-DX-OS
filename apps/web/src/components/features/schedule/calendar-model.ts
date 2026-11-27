// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HarvestEvent } from '@/domain/farm/entities/HarvestEvent'

/** quarantine: no picking; blocked: planned inside it; ready: may be picked; harvested: done. */
export type SpanKind = 'quarantine' | 'blocked' | 'ready' | 'harvested'

export interface Span {
  key: string
  kind: SpanKind
  /** Midnight, local time, of the first and last day covered. */
  from: number
  to: number
  event: HarvestEvent
}

export function dayStart(value: Date | string): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function addDays(time: number, days: number): number {
  const date = new Date(time)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** What each cycle covers on the calendar. A parcel's withdrawal period is drawn once. */
export function spansOf(events: HarvestEvent[]): Span[] {
  const spans: Span[] = []
  const seen = new Set<string>()
  for (const event of events) {
    const safe = event.safeHarvestDate ? dayStart(event.safeHarvestDate) : null
    const applied = event.treatment?.date ? dayStart(event.treatment.date) : null
    if (safe !== null && applied !== null && safe > applied) {
      const key = `q-${event.parcelId}-${safe}`
      if (!seen.has(key)) {
        seen.add(key)
        spans.push({ key, kind: 'quarantine', from: applied, to: addDays(safe, -1), event })
      }
    }
    if (event.harvestedAt) {
      const day = dayStart(event.harvestedAt)
      spans.push({ key: `h-${event.cycleId}`, kind: 'harvested', from: day, to: day, event })
    } else if (event.estimatedHarvestDate) {
      const day = dayStart(event.estimatedHarvestDate)
      spans.push({ key: `p-${event.cycleId}`, kind: safe !== null && day < safe ? 'blocked' : 'ready', from: day, to: day, event })
    }
  }
  return spans
}

/** Weeks starting on Monday that cover the month, as midnight times. */
export function weeksOf(year: number, month: number): number[][] {
  const first = new Date(year, month, 1)
  const last = dayStart(new Date(year, month + 1, 0))
  let day = addDays(dayStart(first), -((first.getDay() + 6) % 7))
  const weeks: number[][] = []
  while (day <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)))
    day = addDays(day, 7)
  }
  return weeks
}

/** The bars of one week: first column (1-7), width, and a row so that bars do not overlap. */
export function weekBars(week: number[], spans: Span[]) {
  const ends: number[] = []
  return spans
    .filter(span => span.to >= week[0] && span.from <= week[6])
    .map(span => {
      const start = week.findIndex(day => day >= span.from)
      let end = 6
      while (week[end] > span.to) end -= 1
      return { span, column: Math.max(0, start) + 1, width: end - Math.max(0, start) + 1 }
    })
    .sort((a, b) => a.column - b.column || b.width - a.width)
    .map(bar => {
      let row = ends.findIndex(end => end < bar.column)
      if (row < 0) row = ends.length
      ends[row] = bar.column + bar.width - 1
      return { ...bar, row: row + 1 }
    })
}
