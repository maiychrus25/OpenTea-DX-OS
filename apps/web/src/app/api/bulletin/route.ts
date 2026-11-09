// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'
import { GetLatestBulletinUseCase } from '@/application/bulletin/GetLatestBulletinUseCase'
import { prisma } from '@/infrastructure/db/prisma.client'

async function getBulletin(request: Request) {
  const { role, htxCode } = await requireTenant()
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  let commodity = url.searchParams.get('commodity')

  if (!commodity) {
    // Default to HTX primary crop
    const htx = await new PrismaHtxProfileRepository(prisma).getProfile(htxCode)
    commodity = htx?.crop_types?.[0] ?? 'rice'
  }

  const repo = new PrismaBulletinRepository(prisma)
  const useCase = new GetLatestBulletinUseCase(repo)
  
  const data = await useCase.execute(commodity)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getBulletin)
