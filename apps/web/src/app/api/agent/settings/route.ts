// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AgentSettingsUseCase } from '@/application/agent/agent-settings'
import { AGENT_PROVIDERS, REPORT_TIME_PATTERN } from '@/domain/agent/settings'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

// The web cannot see whether the installation has a default OpenAI model, so the manager names one.
const agentChoiceSchema = z
  .object({
    provider: z.enum(AGENT_PROVIDERS),
    model: z.string().trim().min(1).max(128).nullable(),
  })
  .refine((choice) => choice.provider !== 'openai' || choice.model !== null, {
    message: 'Nhà cung cấp OpenAI cần tên model',
    path: ['model'],
  })

const saveSettingsSchema = z.object({
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

/** Managers and officers read the cooperative's agent settings; the officer view is read-only. */
async function getAgentSettings() {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') throw new ForbiddenError('Forbidden')
  const useCase = new AgentSettingsUseCase()
  const [settings, providers] = await Promise.all([
    useCase.read(tenant.htxCode),
    useCase.availableProviders(tenant.htxCode),
  ])
  return NextResponse.json({ data: { ...settings, providers, can_edit: tenant.role === 'manager' } })
}

/** Only the manager changes the settings; every change is audited by the table's trigger. */
async function putAgentSettings(request: Request) {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') throw new ForbiddenError('Forbidden')
  const body = saveSettingsSchema.parse(await request.json().catch(() => null))
  const settings = await new AgentSettingsUseCase().save(tenant.htxCode, `user:${tenant.userId}`, {
    agents: body.agents,
    reportTime: body.report_time,
    monthlyLimit: body.monthly_limit_usd,
  })
  return NextResponse.json({ data: settings })
}

export const GET = withErrorHandler(getAgentSettings)
export const PUT = withErrorHandler(putAgentSettings)
