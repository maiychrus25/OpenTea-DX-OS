// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { prisma } from '@/infrastructure/db/prisma.client'
import { HeadPrices, type PriceChange } from './_components/HeadPrices'

export default async function LeafPricesPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') redirect('/login')
  const { htxProfileId } = await requireTenant()

  // The history is only read here; publishing goes through the price API.
  let history: PriceChange[] = []
  try {
    const rows = await prisma.dailyLeafPrice.findMany({
      where: { htx_profile_id: htxProfileId },
      orderBy: [{ price_date: 'desc' }, { updated_at: 'desc' }],
      take: 9,
      select: { id: true, price_date: true, price_vnd_per_kg: true, published_by_id: true, grade: { select: { name: true } } },
    })
    history = rows.map((row) => ({
      id: row.id,
      grade_name: row.grade.name,
      price_date: row.price_date.toISOString(),
      price_vnd_per_kg: row.price_vnd_per_kg,
      mine: row.published_by_id === session.user.id,
    }))
  } catch {
    history = []
  }

  return <HeadPrices history={history} />
}
