// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user || (session.user as any).role !== 'manager') {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })
    }

    const adapter = new KeycloakAdminAdapter()
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
