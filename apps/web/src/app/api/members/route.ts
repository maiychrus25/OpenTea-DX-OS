// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaUserRepository } from '@/infrastructure/db/auth/PrismaUserRepository'
import { ListMembersUseCase } from '@/application/auth/ListMembersUseCase'

async function listMembers(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role

  const url = new URL(request.url)
  const filterRole = url.searchParams.get('role') ?? undefined

  const repo = new PrismaUserRepository()
  const useCase = new ListMembersUseCase(repo)
  
  const data = await useCase.execute(role.toUpperCase(), filterRole)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(listMembers)
