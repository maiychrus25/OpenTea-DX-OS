// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { UpdateHtxProfileUseCase } from '@/application/useCases/UpdateHtxProfileUseCase'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { htxProfileUpdateSchema } from '@/lib/validations/htx-profile.schema'

// Manager role value -- aligns with Domain Glossary (AGENTS.md)
const MANAGER_ROLE = 'manager' as const

// GET /api/profile -- returns HTX profile data (requires authentication)
async function getProfileHandler(_request: Request) {
  const { htxCode } = await requireTenant()

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)
  const profile = await useCase.execute(htxCode)
  return NextResponse.json({ data: profile })
}

// PUT /api/profile -- update HTX profile (Manager only)
async function putProfileHandler(request: Request) {
  const { role, htxCode } = await requireTenant()

  if (role !== MANAGER_ROLE) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const json = await request.json()
  const body = htxProfileUpdateSchema.parse(json)

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new UpdateHtxProfileUseCase(profileRepo)
  const updatedProfile = await useCase.execute(htxCode, body)

  return NextResponse.json({ data: updatedProfile })
}

export const GET = withErrorHandler(getProfileHandler)
export const PUT = withErrorHandler(putProfileHandler)
