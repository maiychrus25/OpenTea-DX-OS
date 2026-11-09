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

/** The signed-in user and their HTX. Throws rather than ever falling back to another HTX. */
export async function requireTenant(): Promise<Tenant> {
  const session = await auth()
  const user = session?.user
  if (!user?.id) throw new UnauthorizedError()
  if (!user.role) throw new ForbiddenError('Forbidden')
  if (!user.htxCode) throw new NoHtxError()

  const htx = await new PrismaHtxProfileRepository().findByCode(user.htxCode)
  if (!htx) throw new NoHtxError()

  return { userId: user.id, role: user.role, htxCode: user.htxCode, htxProfileId: htx.id }
}
