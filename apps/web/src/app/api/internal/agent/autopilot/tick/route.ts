// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { autopilotTickUseCase } from '@/application/telegram/telegram-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** Called every cycle by `dxos-agent`: handles only the cooperative of the agent token (spec §11, contract C3). */
async function postAutopilotTick(request: Request) {
  const caller = await requireAgentCaller(request)
  const result = await autopilotTickUseCase().execute(caller.htxCode)
  return NextResponse.json({ data: result })
}

export const POST = withErrorHandler(labsOnly(postAutopilotTick))
