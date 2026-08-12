// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'

// GET route with no request body â€” Zod validation not applicable.
// For routes with body/params: const body = SomeSchema.parse(await req.json())
async function getProfileHandler(_request: Request) {
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)
  const profile = await useCase.execute()
  return NextResponse.json({ data: profile })
}

export const GET = withErrorHandler(getProfileHandler)
