// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { appRequestIntake } from '@/application/appbuilder/app-builder-services'
import { AppBuildError } from '@/domain/appbuilder/app-build'
import { readJson, requireManagerSession, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

const bodySchema = z.object({ answer_text: z.string() })

/** The manager's answer to the questions, typed on the web instead of Telegram. */
async function postAnswer(request: Request, context: unknown) {
  const who = await requireManagerSession()
  const id = await uuidParam(context)
  const body = bodySchema.parse(await readJson(request))
  if (!(await appRequestIntake().answer(who.tenant.htxCode, id, body.answer_text))) {
    throw new AppBuildError('WRONG_STATE', 'Yêu cầu không còn chờ câu trả lời')
  }
  return NextResponse.json({ data: { status: 'asking' } })
}

export const POST = withAppBuildErrors(labsOnly(postAnswer))
