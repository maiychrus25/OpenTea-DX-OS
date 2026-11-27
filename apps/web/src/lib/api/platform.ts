// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'

/** The signed-in platform admin. The platform admin has no HTX, so there is no tenant here. */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = await auth()
  const user = session?.user
  if (!user?.id) throw new UnauthorizedError()
  if (user.role !== 'platform_admin') throw new ForbiddenError('Forbidden')
  return { userId: user.id }
}
