// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'

const SoilHealthPageClient = dynamic(
  () => import('./SoilHealthPageClient'),
  { ssr: false }
)

export const metadata: Metadata = {
  title: 'Sức khỏe đất | DX-AgriMarket',
  description: 'Lịch sử độ ẩm và nhiệt độ thổ nhưỡng của vùng trồng',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SoilHealthPage({ params }: PageProps) {
  const { id } = await params

  // Server-side: fetch household name
  const { htxProfileId } = await requireTenant()
  const household = await prisma.household.findFirst({
    where: { id, htx_profile_id: htxProfileId },
    select: { name: true },
  })

  const householdName = household?.name || 'Nông hộ'

  return (
    <SoilHealthPageClient
      householdId={id}
      householdName={householdName}
    />
  )
}
