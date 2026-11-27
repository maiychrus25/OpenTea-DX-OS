// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')

/** The text fields of the multipart upload (the file is checked separately). */
export const certificateFieldsSchema = z.object({
  kind: z.enum(['VIETGAP', 'OCOP', 'ORGANIC', 'OTHER']),
  number: z.string().trim().min(1).max(60),
  issuer: z.string().trim().min(1).max(120),
  issued_on: day,
  expires_on: day,
  scope_note: z.string().trim().max(200).optional(),
}).strict().refine((v) => v.expires_on >= v.issued_on, 'Ngày hết hạn phải sau ngày cấp')

export const certificateRevokeSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict()
