// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { appBuilderAgentService } from '@/application/appbuilder/app-builder-services'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { readJson, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'

/** A12 asks up to 5 questions; the web sends them as one Telegram message. */
async function postQuestions(request: Request, context: unknown) {
  const caller = await requireAgentCaller(request)
  const id = await uuidParam(context)
  const body = (await readJson(request)) as { questions?: unknown } | null
  await appBuilderAgentService().askQuestions(caller.htxCode, id, body?.questions)
  return NextResponse.json({ data: { status: 'asking' } })
}

export const POST = withAppBuildErrors(postQuestions)
