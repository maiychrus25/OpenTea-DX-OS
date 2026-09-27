// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'
import { GetLatestBulletinUseCase } from '@/application/bulletin/GetLatestBulletinUseCase'
import { prisma } from '@/infrastructure/db/prisma.client'

async function getBulletin(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  let commodity = url.searchParams.get('commodity')

  if (!commodity) {
    // Default to HTX primary crop
    // Assuming there is only one HTX profile per deployment as per schema
    const htx = await prisma.htxProfile.findFirst({ orderBy: { created_at: 'asc' } })
    commodity = htx?.crop_types?.[0] ?? 'rice'
  }

  const repo = new PrismaBulletinRepository(prisma)
  const useCase = new GetLatestBulletinUseCase(repo)
  
  const data = await useCase.execute(commodity)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getBulletin)
