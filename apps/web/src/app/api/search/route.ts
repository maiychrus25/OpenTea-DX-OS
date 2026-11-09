// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { GlobalSearchUseCase } from '@/application/search/GlobalSearchUseCase'

async function getSearch(request: Request) {
  const { role, htxProfileId } = await requireTenant()
  // Support all three active roles: manager, officer, farmer
  if (role !== 'manager' && role !== 'officer' && role !== 'farmer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const useCase = new GlobalSearchUseCase()
  const data = await useCase.execute(query, htxProfileId)
  
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getSearch)
