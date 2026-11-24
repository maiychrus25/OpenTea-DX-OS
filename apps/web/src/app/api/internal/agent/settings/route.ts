// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { AgentSettingsUseCase } from '@/application/agent/agent-settings'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** The agent reads its cooperative's provider choice and budget at the start of each run (C1). */
async function getInternalAgentSettings(request: Request) {
  const caller = await requireAgentCaller(request)
  const settings = await new AgentSettingsUseCase().read(caller.htxCode)
  return NextResponse.json({ data: settings })
}

export const GET = withErrorHandler(getInternalAgentSettings)
