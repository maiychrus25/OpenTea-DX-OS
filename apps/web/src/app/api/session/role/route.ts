// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth, unstable_update } from '@/auth'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { HUMAN_ROLES, heldRoles, homeFor } from '@/lib/auth/roles'
import { logger } from '@/lib/logger'

const bodySchema = z.object({ role: z.enum(HUMAN_ROLES) })

/** Switches the active role. The role must be one the signed-in token holds; the session callback checks it again. */
async function switchRole(request: Request) {
  const session = await auth()
  const user = session?.user
  if (!user?.id) throw new UnauthorizedError()

  const { role } = bodySchema.parse(await request.json())
  if (!heldRoles(user).includes(role)) throw new ForbiddenError('Bạn không có vai này.')

  // NextAuth 5 (beta.32): unstable_update from the server; its jwt callback accepts only a held role.
  await unstable_update({ role } as never)
  // No audit-store caller exists in the web yet (spec S2 section 4.2): a structured log line stands in for audit.record_event('role.switch').
  logger.info('role.switch', { userId: user.id, from: user.role, to: role })
  return NextResponse.json({ data: { role, home: homeFor(role) } })
}

export const POST = withErrorHandler(switchRole)
