// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { AppStoreError } from '@/domain/entities/app-store'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

export const dynamic = 'force-dynamic'

// Same pattern as "id" in platform/apps/manifest.schema.json. Any other field of the body (an HTX included) is ignored.
const bodySchema = z.object({ appId: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/), action: z.enum(['ENABLE', 'DISABLE']) })

async function postRequest(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  if (session.user.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ trưởng HTX được dùng Kho ứng dụng' } }, { status: 403 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Yêu cầu không hợp lệ' } }, { status: 400 })

  // The HTX and the requester come from the session, never from the body.
  const tenant = await requireTenant()
  try {
    const status = await new AppStoreUseCase(new PrismaAppStoreRepository()).requestChange({ ...tenant, userName: session.user.name ?? null }, parsed.data.appId, parsed.data.action)
    return NextResponse.json({ data: { status } }, { status: 202 })
  } catch (error) {
    if (error instanceof AppStoreError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    }
    throw error
  }
}

export const POST = withErrorHandler(postRequest)
