// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'

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
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 })
  }
}
