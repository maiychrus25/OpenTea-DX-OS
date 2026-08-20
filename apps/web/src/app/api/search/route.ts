// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { GlobalSearchUseCase } from '@/application/search/GlobalSearchUseCase'
import { prisma } from '@/infrastructure/db/prisma.client'

async function getSearch(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const htx = await prisma.htxProfile.findFirst()
  if (!htx) {
    return NextResponse.json({ data: [] })
  }

  const useCase = new GlobalSearchUseCase()
  
  const data = await useCase.execute(query, htx.id)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getSearch)
