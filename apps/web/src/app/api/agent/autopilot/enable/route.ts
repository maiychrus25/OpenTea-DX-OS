// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { ReauthRequiredError } from '@/application/agent/autopilot/AutopilotService'
import { autopilotService } from '@/application/telegram/telegram-services'
import { MAX_DAILY_CAP } from '@/domain/agent/autopilot'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

const enableSchema = z.object({
  unlocked_kinds: z.array(z.string().min(1).max(128)).max(20),
  daily_cap: z.number().int().min(1).max(MAX_DAILY_CAP),
  acknowledged: z.boolean(),
})

/** Only a manager, with a sign-in at most five minutes old, turns autonomous mode on. */
async function postEnableAutopilot(request: Request) {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') throw new ForbiddenError('Forbidden')
  const session = await auth()
  const body = enableSchema.parse(await request.json().catch(() => null))
  try {
    const view = await autopilotService().enable({
      htxCode: tenant.htxCode,
      userId: tenant.userId,
      userName: session?.user?.name || session?.user?.email || tenant.userId,
      unlockedKinds: body.unlocked_kinds,
      dailyCap: body.daily_cap,
      acknowledged: body.acknowledged,
      authTime: session?.authTime,
    })
    return NextResponse.json({ data: view })
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      return NextResponse.json(
        { error: { code: 'REAUTH_REQUIRED', message: 'Vui lòng đăng nhập lại để bật tự vận hành.' } },
        { status: 401 }
      )
    }
    throw err
  }
}

export const POST = withErrorHandler(labsOnly(postEnableAutopilot))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
