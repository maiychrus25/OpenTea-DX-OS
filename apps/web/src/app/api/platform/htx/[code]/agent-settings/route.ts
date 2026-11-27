// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { AgentSettingsUseCase } from '@/application/agent/agent-settings'
import { NotFoundError } from '@/domain/errors'
import { saveSettingsSchema } from '@/lib/api/agent-settings-schema'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'

type Context = { params: { code: string } }

async function requireHtx(code: string): Promise<void> {
  if (!(await new PrismaHtxProfileRepository().findByCode(code))) throw new NotFoundError('Không tìm thấy HTX')
}

/** The platform admin reads the AI settings of one cooperative. */
async function getSettings(_request: Request, { params }: Context) {
  await requirePlatformAdmin()
  await requireHtx(params.code)
  const useCase = new AgentSettingsUseCase()
  const [settings, providers] = await Promise.all([useCase.read(params.code), useCase.availableProviders(params.code)])
  return NextResponse.json({ data: { ...settings, providers, can_edit: true } })
}

/** The platform admin saves them; every change is audited by the table's trigger. */
async function putSettings(request: Request, { params }: Context) {
  const { userId } = await requirePlatformAdmin()
  await requireHtx(params.code)
  const body = saveSettingsSchema.parse(await request.json().catch(() => null))
  const settings = await new AgentSettingsUseCase().save(params.code, `user:${userId}`, {
    agents: body.agents,
    reportTime: body.report_time,
    monthlyLimit: body.monthly_limit_usd,
  })
  return NextResponse.json({ data: settings })
}

export const GET = withErrorHandler(getSettings)
export const PUT = withErrorHandler(putSettings)
