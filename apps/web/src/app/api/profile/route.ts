// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { UpdateHtxProfileUseCase } from '@/application/useCases/UpdateHtxProfileUseCase'
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'
import { htxProfileUpdateSchema } from '@/domain/profile/schemas/htxProfileSchema'

// Manager role value — aligns with Domain Glossary (AGENTS.md)
const MANAGER_ROLE = 'manager' as const

chore/license-headers-changelog
// GET route with no request body â€” Zod validation not applicable.
// For routes with body/params: const body = SomeSchema.parse(await req.json())

 main
async function getProfileHandler(_request: Request) {
  // GET also requires authentication — profile data is HTX-internal
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)
  const profile = await useCase.execute()
  return NextResponse.json({ data: profile })
}

async function putProfileHandler(request: Request) {
  const session = await auth()

  // Note: session.user.role is injected via NextAuth callbacks (see auth.ts)
  if (!session || !session.user || session.user.role !== MANAGER_ROLE) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const json = await request.json()
  const body = htxProfileUpdateSchema.parse(json)

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new UpdateHtxProfileUseCase(profileRepo)
  const updatedProfile = await useCase.execute(body)

  return NextResponse.json({ data: updatedProfile })
}

export const GET = withErrorHandler(getProfileHandler)
export const PUT = withErrorHandler(putProfileHandler)
