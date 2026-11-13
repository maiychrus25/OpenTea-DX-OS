// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

export const dynamic = 'force-dynamic'

// Same pattern as "id" in platform/apps/manifest.schema.json.
const APP_ID = /^[a-z][a-z0-9-]{1,30}$/
const notFound = () => NextResponse.json({ error: { code: 'APP_NOT_FOUND', message: 'Không có ứng dụng này trong kho.' } }, { status: 404 })

async function getScreenshot(_request: Request, { params }: { params: { id: string; position: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  if (session.user.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ trưởng HTX được dùng Kho ứng dụng' } }, { status: 403 })
  }
  if (!APP_ID.test(params.id) || !/^[0-3]$/.test(params.position)) return notFound()
  await requireTenant()
  const image = await new AppStoreUseCase(new PrismaAppStoreRepository()).screenshot(params.id, Number(params.position))
  if (!image) return notFound()
  // Bytes are served as stored; the type was checked by magic bytes when the catalogue was synced.
  return new NextResponse(Buffer.from(image.bytes), {
    headers: { 'content-type': image.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300' },
  })
}

export const GET = withErrorHandler(getScreenshot)
