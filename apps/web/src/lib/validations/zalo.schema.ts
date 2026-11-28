// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { TEMPLATE_KEYS, TEMPLATE_PARAM_KEYS, ZALO_EVENT_KINDS } from '@/domain/zalo/zalo-events'

/** The OA tokens, as the admin page and the relay both send them. */
export const zaloTokensSchema = z.object({
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().min(1).max(4096),
  expires_at: z.string().datetime({ offset: true }),
}).strict()

export const zaloSettingsSchema = z.object({
  enabled: z.boolean(),
  kinds: z.array(z.enum(ZALO_EVENT_KINDS)).max(ZALO_EVENT_KINDS.length).transform((kinds) => Array.from(new Set(kinds))),
  // Quiet hours wrap midnight: from the start hour in the evening to the end hour in the morning.
  quiet_start_hour: z.number().int().min(12).max(23),
  quiet_end_hour: z.number().int().min(1).max(11),
  // The platform's default is 2.000 a month; a cooperative may ask for more up to this ceiling.
  monthly_quota: z.number().int().min(0).max(10000),
}).strict()

export const zaloTemplatesSchema = z.object({
  templates: z.array(z.object({
    template_key: z.enum(TEMPLATE_KEYS),
    zns_template_id: z.string().trim().regex(/^[0-9A-Za-z_-]{1,40}$/),
    params: z.array(z.string().max(60)).max(20),
  }).strict().superRefine((t, ctx) => {
    const allowed = TEMPLATE_PARAM_KEYS[t.template_key]
    // A name outside the allowed list (a bank account, a pesticide, another person's name) can never be requested.
    if (t.params.some((p) => !allowed.includes(p)) || new Set(t.params).size !== t.params.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tham số không hợp lệ cho mẫu này' })
    }
  })).min(1).max(TEMPLATE_KEYS.length),
}).strict()

export const zaloConsentSchema = z.object({
  status: z.enum(['OPTED_IN', 'OPTED_OUT']),
  source: z.enum(['REGISTRATION', 'OFFICER', 'MEMBER']),
}).strict()

export const zaloDeliveriesQuerySchema = z.object({
  status: z.enum(['pending', 'leased', 'sent', 'failed', 'skipped']).optional(),
  kind: z.enum(ZALO_EVENT_KINDS).optional(),
})
