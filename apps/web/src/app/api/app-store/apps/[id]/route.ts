// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { AppStoreError } from '@/domain/entities/app-store'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

export const dynamic = 'force-dynamic'

// Same pattern as "id" in platform/apps/manifest.schema.json.
const APP_ID = /^[a-z][a-z0-9-]{1,30}$/
const notFound = () => NextResponse.json({ error: { code: 'APP_NOT_FOUND', message: 'Không có ứng dụng này trong kho.' } }, { status: 404 })

async function getDetail(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  if (session.user.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ trưởng HTX được dùng Kho ứng dụng' } }, { status: 403 })
  }
  if (!APP_ID.test(params.id)) return notFound()
  const tenant = await requireTenant()
  try {
    const data = await new AppStoreUseCase(new PrismaAppStoreRepository()).detail(tenant.htxCode, params.id)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AppStoreError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    throw error
  }
}

export const GET = withErrorHandler(getDetail)
