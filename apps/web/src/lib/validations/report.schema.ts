// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'
import { REPORT_SECTIONS } from '@/domain/report/views'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')
const MAX_DAYS = 3 * 366

export const reportRangeSchema = z.object({ from: day, to: day })
  .refine((v) => v.from <= v.to, 'Ngày bắt đầu phải trước ngày kết thúc')
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_DAYS, 'Khoảng ngày tối đa ba năm')

export const reportCsvQuerySchema = reportRangeSchema.and(z.object({ section: z.enum(REPORT_SECTIONS) }))
