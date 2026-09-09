// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'
import { prisma } from '@/infrastructure/db/prisma.client'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  const role = (session?.user as any)?.role

  // Only manager can delete
  if (role !== 'manager' && role !== 'MANAGER') {
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 403 })
  }

  try {
    const adapter = new KeycloakAdminAdapter()
    const useCase = new DeleteMemberUseCase(adapter)
    await useCase.execute(params.id)

    // Unlink from PostgreSQL Household so it becomes orphaned again
    await prisma.household.updateMany({
      where: { keycloak_user_id: params.id },
      data: { keycloak_user_id: null }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete Member Error:', error);
    return NextResponse.json({ error: { message: error.message || 'Unknown error' } }, { status: 500 })
  }
}
