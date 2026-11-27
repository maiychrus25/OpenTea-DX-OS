// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { ForbiddenError, NoHtxError, UnauthorizedError } from '@/domain/errors'
import type { HumanRole } from '@/lib/auth/roles'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'

export type Tenant = {
  userId: string
  /** The active role. `platform_admin` never reaches a Tenant: it has no HTX. */
  role: Exclude<HumanRole, 'platform_admin'>
  htxCode: string
  htxProfileId: string
}

/** The signed-in user and their HTX. Throws rather than ever falling back to another HTX. */
export async function requireTenant(): Promise<Tenant> {
  const session = await auth()
  const user = session?.user
  if (!user?.id) throw new UnauthorizedError()
  if (!user.role || user.role === 'platform_admin') throw new ForbiddenError('Forbidden')
  if (!user.htxCode) throw new NoHtxError()

  const htx = await new PrismaHtxProfileRepository().findByCode(user.htxCode)
  if (!htx) throw new NoHtxError()

  return { userId: user.id, role: user.role, htxCode: user.htxCode, htxProfileId: htx.id }
}
