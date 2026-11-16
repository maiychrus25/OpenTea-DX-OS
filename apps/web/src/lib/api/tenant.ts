// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { ForbiddenError, NoHtxError, UnauthorizedError } from '@/domain/errors'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'

export type Tenant = {
  userId: string
  role: 'manager' | 'officer' | 'farmer'
  htxCode: string
  htxProfileId: string
}

type TenantUser = { id?: string | null; role?: Tenant['role'] | null; htxCode?: string | null }

/**
 * The signed-in user and their HTX. Throws rather than ever falling back to another HTX.
 * Routes that accept a mobile Bearer pass the user they already resolved with authFromRequest; the rest read the session.
 */
export async function requireTenant(resolved?: TenantUser | null): Promise<Tenant> {
  const user = resolved ?? (await auth())?.user
  if (!user?.id) throw new UnauthorizedError()
  if (!user.role) throw new ForbiddenError('Forbidden')
  if (!user.htxCode) throw new NoHtxError()

  const htx = await new PrismaHtxProfileRepository().findByCode(user.htxCode)
  if (!htx) throw new NoHtxError()

  return { userId: user.id, role: user.role, htxCode: user.htxCode, htxProfileId: htx.id }
}
