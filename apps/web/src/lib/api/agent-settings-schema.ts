// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { AGENT_PROVIDERS, REPORT_TIME_PATTERN } from '@/domain/agent/settings'

// The web cannot see whether the installation has a default OpenAI model, so the platform admin names one.
const agentChoiceSchema = z
  .object({
    provider: z.enum(AGENT_PROVIDERS),
    model: z.string().trim().min(1).max(128).nullable(),
  })
  .refine((choice) => choice.provider !== 'openai' || choice.model !== null, {
    message: 'Nhà cung cấp OpenAI cần tên model',
    path: ['model'],
  })

export const saveSettingsSchema = z.object({
  agents: z.object({
    'journal-review': agentChoiceSchema,
    digest: agentChoiceSchema,
    bulletin: agentChoiceSchema,
    assistant: agentChoiceSchema,
    improvement: agentChoiceSchema,
    'daily-campaign': agentChoiceSchema,
    'app-builder': agentChoiceSchema,
    strategy: agentChoiceSchema,
  }),
  report_time: z.string().regex(REPORT_TIME_PATTERN),
  monthly_limit_usd: z.number().positive().max(1_000_000).nullable(),
})

