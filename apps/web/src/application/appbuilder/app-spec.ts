// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import { GENERATED_APP_ID_PATTERN } from '@/domain/appbuilder/app-build'

const NAME = /^[a-z][a-z_]{1,29}$/

const fieldSchema = z
  .object({
    name: z.string().regex(NAME),
    type: z.enum(['text', 'integer', 'number', 'date', 'boolean', 'choice']),
    label_vi: z.string().trim().min(1).max(60),
    choices: z.array(z.string().trim().min(1).max(40)).min(2).max(20).optional(),
  })
  .strict()
  .refine((field) => field.type !== 'choice' || field.choices !== undefined, {
    message: 'Trường kiểu choice cần danh sách lựa chọn',
  })

/** The short specification A12 writes and the manager approves (contract C2). It has no place for actions (H2). */
export const appSpecSchema = z
  .object({
    app_id: z.string().regex(GENERATED_APP_ID_PATTERN),
    name_vi: z.string().trim().min(1).max(60),
    summary_vi: z.string().trim().min(1).max(300),
    roles: z
      .array(z.object({ role: z.enum(['farmer', 'officer', 'manager']), can_vi: z.string().trim().min(1).max(160) }).strict())
      .min(1)
      .max(3),
    screens: z
      .array(
        z
          .object({
            path: z.string().regex(/^\/[a-z0-9/-]{0,40}$/),
            title_vi: z.string().trim().min(1).max(60),
            purpose_vi: z.string().trim().min(1).max(160),
          })
          .strict()
      )
      .min(1)
      .max(8),
    data: z
      .array(z.object({ table: z.string().regex(NAME), fields: z.array(fieldSchema).min(1).max(15) }).strict())
      .max(5),
    agent_reads: z
      .array(z.object({ name: z.string().regex(/^[a-z_]{2,30}$/), description_vi: z.string().trim().min(1).max(160) }).strict())
      .max(5),
  })
  .strict()

export type AppSpec = z.infer<typeof appSpecSchema>

export const questionsSchema = z.array(z.string().trim().min(1).max(160)).min(1).max(5)

export function specDigest(spec: unknown): string {
  return sha256Hex(canonicalJson(spec))
}

/** The lines the approver reads: the name, the summary, the screens and the data fields, and the build time. */
export function specPreviewLines(spec: AppSpec): string[] {
  const lines = [`${spec.name_vi}: ${spec.summary_vi}`]
  lines.push(`Màn hình: ${spec.screens.map((screen) => screen.title_vi).join(', ')}`)
  for (const table of spec.data) {
    lines.push(`Dữ liệu ${table.table}: ${table.fields.map((field) => field.label_vi).join(', ')}`)
  }
  lines.push('Xây mất khoảng 10–30 phút.')
  return lines
}
