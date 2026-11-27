// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const DAY = 86_400_000
export const ACTIVITY_LABELS: Record<string, string> = {
  SPRAYING: 'Phun thuốc', FERTILIZING: 'Bón phân', IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch', SOWING: 'Gieo sạ', OTHER: 'Khác',
}
export const dayMonth = (date: Date) => date.toLocaleDateString('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit',
})
export const cultivated = (status: string) => status !== 'DRAFT' && status !== 'HARVESTED'

/** Vietnam has a fixed UTC+7 offset and no daylight-saving transitions. */
export function vietnamDayStart(date: Date): Date {
  return new Date(Math.floor((date.getTime() + 7 * 3_600_000) / DAY) * DAY - 7 * 3_600_000)
}

export function dailyCounts(dates: Date[], now: Date): number[] {
  const start = vietnamDayStart(now).getTime() - 6 * DAY
  const counts = Array<number>(7).fill(0)
  for (const date of dates) {
    const index = Math.floor((date.getTime() - start) / DAY)
    if (index >= 0 && index < 7 && date <= now) counts[index]++
  }
  return counts
}

export function latestSafeDates(activities: { safe_harvest_date: Date | null; journal_entry: { parcel_id: string } }[]) {
  const dates = new Map<string, Date>()
  for (const activity of activities) {
    const { safe_harvest_date: safe, journal_entry: { parcel_id: id } } = activity
    if (safe && (!dates.has(id) || safe > dates.get(id)!)) dates.set(id, safe)
  }
  return dates
}

export function householdProgress(parcels: { status: string; journal_entries: unknown[] }[]) {
  const active = parcels.filter(parcel => cultivated(parcel.status))
  const recorded = active.filter(parcel => parcel.journal_entries.length > 0).length
  return { active: active.length, recorded, percent: active.length ? Math.round(recorded / active.length * 100) : null }
}

export function weeklyActivity(entries: { entry_date: Date; activity_type: string }[], now: Date) {
  const start = vietnamDayStart(now).getTime() - 29 * DAY
  const weeks = Array.from({ length: 5 }, (_, index) => ({
    label: `${dayMonth(new Date(start + index * 7 * DAY))}–${dayMonth(new Date(Math.min(start + (index * 7 + 6) * DAY, vietnamDayStart(now).getTime())))}`,
    counts: Object.fromEntries(Object.keys(ACTIVITY_LABELS).map(type => [type, 0])),
    total: 0,
  }))
  for (const entry of entries) {
    const index = Math.floor((entry.entry_date.getTime() - start) / (7 * DAY))
    if (index < 0 || index >= weeks.length || entry.entry_date > now) continue
    const type = entry.activity_type in ACTIVITY_LABELS ? entry.activity_type : 'OTHER'
    weeks[index].counts[type]++
    weeks[index].total++
  }
  return weeks
}

export function approvalMetrics(entries: { created_at: Date; approved_at: Date | null }[]) {
  const durations = entries.flatMap(entry => entry.approved_at && entry.approved_at >= entry.created_at
    ? [entry.approved_at.getTime() - entry.created_at.getTime()] : [])
  if (!durations.length) return null
  return {
    count: durations.length,
    rate: Math.round(durations.filter(duration => duration <= 2 * DAY).length / durations.length * 100),
    averageDays: durations.reduce((sum, duration) => sum + duration, 0) / durations.length / DAY,
  }
}
