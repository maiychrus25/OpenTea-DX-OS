// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'

// GET /api/profile -- returns HTX profile data (requires authentication)
async function getProfileHandler(_request: Request) {
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)
  const profile = await useCase.execute()
  return NextResponse.json({ data: profile })
}

export const GET = withErrorHandler(getProfileHandler)
