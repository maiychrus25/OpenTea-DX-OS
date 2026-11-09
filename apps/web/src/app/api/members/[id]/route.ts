// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'

async function deleteMember(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await requireTenant()

  try {
    if (tenant.role !== 'manager') {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })
    }

    const adapter = new KeycloakAdminAdapter()
    if ((await adapter.getUserHtxCode(params.id)) !== tenant.htxCode) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy thành viên' } }, { status: 404 })
    }
    const householdRepo = new PrismaHouseholdRepository()
    const useCase = new DeleteMemberUseCase(adapter, householdRepo)
    await useCase.execute(params.id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Delete Member Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: { message: errorMessage } }, { status: 500 })
  }
}

export const DELETE = withErrorHandler(deleteMember)
