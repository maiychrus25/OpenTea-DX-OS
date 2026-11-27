// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { AppBuildError } from '@/domain/appbuilder/app-build'
import { AppStoreError } from '@/domain/entities/app-store'
import { ForbiddenError, UnauthorizedError, ValidationError } from '@/domain/errors'
import { withErrorHandler } from './withErrorHandler'

/** `withErrorHandler` that also answers the factory's expected refusals as `{ error: { code, message } }` with their status. */
export function withAppBuildErrors<TContext = any>(
  handler: (req: Request, context: TContext) => Promise<NextResponse>
): (req: Request, context?: TContext) => Promise<NextResponse> {
  return withErrorHandler<TContext>(async (req, context) => {
    try {
      return await handler(req, context)
    } catch (error) {
      if (error instanceof AppBuildError || error instanceof AppStoreError) {
        return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
      }
      throw error
    }
  }) as (req: Request, context?: TContext) => Promise<NextResponse>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The `id` of a dynamic route as a uuid; anything else is a 400 instead of a database error. */
export async function uuidParam(context: unknown, name = 'id'): Promise<string> {
  const { params } = context as { params: Promise<Record<string, string>> | Record<string, string> }
  const value = (await params)[name]
  if (!UUID.test(value ?? '')) throw new ValidationError('Mã không hợp lệ')
  return value
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}

/** The signed-in manager and their cooperative. Throws UnauthorizedError (401) or ForbiddenError (403), which the handler answers. */
export async function requireManagerSession() {
  const { auth } = await import('@/auth')
  const { requireTenant } = await import('@/lib/api/tenant')
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') throw new ForbiddenError('Chỉ trưởng HTX được yêu cầu xây app')
  return { tenant, userName: session.user.name ?? session.user.email ?? null }
}
