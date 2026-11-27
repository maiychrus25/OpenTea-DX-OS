// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { DomainError, ForbiddenError, NotFoundError } from '@/domain/errors'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaMembershipRepository } from '@/infrastructure/db/auth/PrismaMembershipRepository'
import { isHumanRole, type HumanRole } from '@/lib/auth/roles'

// The only roles a manager can give or take. manager and platform_admin are never touched here.
const EDITABLE = ['farmer', 'officer', 'accountant'] as const
const bodySchema = z.object({ roles: z.array(z.enum(EDITABLE)) })

async function editRoles(request: Request, { params }: { params: { id: string } }) {
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') throw new ForbiddenError('Chỉ Trưởng HTX mới được sửa vai')

  const { roles } = bodySchema.parse(await request.json().catch(() => ({})))
  const wanted = Array.from(new Set(roles))

  const adapter = new KeycloakAdminAdapter()
  const target = await adapter.getMember(params.id)
  // Another HTX looks the same as a missing user, so ids of other HTXs are not revealed.
  if (!target || target.htxCode !== tenant.htxCode) throw new NotFoundError('Không tìm thấy thành viên')

  const isManager = target.roles.includes('manager')
  if (isManager && target.id !== tenant.userId) throw new ForbiddenError('Không thể sửa vai của Trưởng HTX khác')
  // A manager keeps the manager role, so their secondary set may be empty; everyone else needs at least one role.
  if (!isManager && wanted.length === 0) throw new DomainError('Thành viên phải có ít nhất một vai')

  const held = EDITABLE.filter((role) => target.roles.includes(role))
  const add = wanted.filter((role) => !held.includes(role))
  const remove = held.filter((role) => !wanted.includes(role))
  await adapter.setRealmRoles(target.id, add, remove)

  // Adding farmer creates or links the household as an invitation does. Removing farmer keeps the household and its history.
  if (add.includes('farmer')) {
    const households = new PrismaHouseholdRepository()
    if (!(await households.findByKeycloakUserId(target.id))) {
      const orphan = await households.findOrphanedByPhone(target.phone, tenant.htxProfileId)
      const household =
        orphan ??
        (await households.create({
          household_code: target.phone,
          owner_name: target.fullName,
          phone: target.phone,
          htx_profile_id: tenant.htxProfileId,
        }))
      await households.linkToKeycloak(household.id, target.id)
    }
  }

  const finalRoles = [...(isManager ? ['manager'] : []), ...wanted].filter(isHumanRole) as HumanRole[]
  await new PrismaMembershipRepository().sync(target.id, tenant.htxProfileId, finalRoles)
  return NextResponse.json({ data: { id: target.id, roles: finalRoles } })
}

export const PUT = withErrorHandler(editRoles)
