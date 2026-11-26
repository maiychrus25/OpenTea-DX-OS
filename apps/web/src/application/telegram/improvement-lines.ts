// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import type { EffectVerdict, Improvement } from '@/domain/agent/ports/ImprovementRepository'

const DAY_MS = 86_400_000
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const VERDICT_LABEL: Record<EffectVerdict, string> = {
  helped: 'Đã giúp',
  no_effect: 'Chưa thấy tác dụng',
  drop: 'Nên bỏ',
}

/** Monday = 1 … Sunday = 7 for a Vietnam `YYYY-MM-DD` day (the weekday of a campaign and of a template). */
export function vnIsoWeekday(day: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(
    new Date(`${day}T12:00:00+07:00`)
  )
  return WEEKDAYS.indexOf(name) + 1
}

/** The Monday (Vietnam, `YYYY-MM-DD`) of the week an instant falls in. */
export function vnMondayOf(instant: Date): string {
  const day = vnDayOf(instant)
  return vnDayOf(new Date(vnDayStart(day).getTime() - (vnIsoWeekday(day) - 1) * DAY_MS))
}

/** `Nhắc theo mẫu:` lines of the 06:00 message and the inbox panel, at most two (contract C7). */
export function templateReminderLines(templates: Improvement[]): string[] {
  return templates.slice(0, 2).map((template) => `Nhắc theo mẫu: ${template.titleVi}`)
}

/**
 * One verdict line per improvement measured in [from, to]: its latest measurement in the window
 * (contract C6). Declined or unmeasured improvements never reach this list.
 */
export function measuredLines(measured: Improvement[], from: Date, to: Date): string[] {
  const inWindow = (at: string) => {
    const time = new Date(at).getTime()
    return time >= from.getTime() && time <= to.getTime()
  }
  return measured.flatMap((improvement) => {
    const entry = [improvement.effect.after_4w, improvement.effect.after_2w].find((e) => e && inWindow(e.at))
    return entry ? [`${VERDICT_LABEL[entry.verdict]}: ${improvement.titleVi}`] : []
  })
}

/** The improvement lines of the weekly report: at most three, after the figures (contract C6). */
export function weeklyImprovementLines(createdThisWeek: number, verdicts: string[]): string[] {
  const lines = createdThisWeek > 0 ? [`Cải tiến tuần này: ${createdThisWeek} đề xuất`] : []
  return [...lines, ...verdicts].slice(0, 3)
}
