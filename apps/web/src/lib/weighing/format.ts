// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/** A VND amount with Vietnamese grouping, e.g. 148200 → "148.200". */
export const money = (vnd: number | string) => Number(vnd).toLocaleString('vi-VN')

/** Clock time in Vietnam, e.g. "14:05". */
export const clockVn = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: VN_TIME_ZONE })

/** "2026-11-28" → "28/11". */
export const dayMonth = (ymd: string) => ymd.slice(8, 10) + '/' + ymd.slice(5, 7)

/** "2026-11-28" → "28/11/2026". */
export const dayMonthYear = (ymd: string) => `${dayMonth(ymd)}/${ymd.slice(0, 4)}`
