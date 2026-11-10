// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SetupWizard } from './_components/setup-wizard'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'

export default async function FarmZoneSetupPage() {
  const session = await auth()
  
  // Officer check (optional/standard for this project)
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  const { htxCode } = await requireTenant()
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  let cropTypes: string[] = []
  try {
    const profile = await useCase.execute(htxCode)
    cropTypes = profile.crop_types ?? []
  } catch {
    // If no profile, we pass empty array or fallback
  }

  // Fallback to something if empty, or just pass it down
  if (cropTypes.length === 0) {
    cropTypes = ['Chè', 'Rau màu'] // Fallback if HTX hasn't configured crops yet
  }

  return <SetupWizard cropOptions={cropTypes} />
}
