// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { AgentSettingsUseCase } from '@/application/agent/agent-settings'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** Managers and officers read the cooperative's agent settings, read-only. */
async function getAgentSettings() {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager' && tenant.role !== 'officer') throw new ForbiddenError('Forbidden')
  const useCase = new AgentSettingsUseCase()
  const [settings, providers] = await Promise.all([
    useCase.read(tenant.htxCode),
    useCase.availableProviders(tenant.htxCode),
  ])
  return NextResponse.json({ data: { ...settings, providers, can_edit: false } })
}

/** Nobody saves here any more: the platform admin sets the AI of each cooperative (PUT /api/platform/htx/[code]/agent-settings). */
async function putAgentSettings(): Promise<NextResponse> {
  throw new ForbiddenError('Cấu hình AI do quản trị nền tảng đặt.')
}

export const GET = withErrorHandler(getAgentSettings)
export const PUT = withErrorHandler(putAgentSettings)
