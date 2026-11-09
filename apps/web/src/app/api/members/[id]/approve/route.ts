// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { ApproveMemberUseCase } from '@/application/auth/approve-member.use-case'

async function approveMember(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await requireTenant()

  // Only manager can approve
  if (tenant.role !== 'manager') {
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 403 })
  }

  try {
    const adapter = new KeycloakAdminAdapter()
    if ((await adapter.getUserHtxCode(params.id)) !== tenant.htxCode) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy thành viên' } }, { status: 404 })
    }
    const useCase = new ApproveMemberUseCase(adapter)
    await useCase.execute(params.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 })
  }
}

export const POST = withErrorHandler(approveMember)
