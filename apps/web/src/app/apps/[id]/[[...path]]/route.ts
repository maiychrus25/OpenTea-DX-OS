// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { appResponse, createPublicLimiter, forwardToApp } from '@/application/apps/forward-to-app'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { getCoreToken } from '@/lib/auth/core-token'
import { clientIp } from '@/lib/ip-rate-limit'
import { logger } from '@/lib/logger'

// Per user and per request: never render or cache this at build time.
export const dynamic = 'force-dynamic'

const installedApps = new PrismaInstalledAppRepository()
const isPublicLimited = createPublicLimiter()

async function handle(req: Request, { params }: { params: { id: string; path?: string[] } }): Promise<Response> {
  let app
  try {
    app = await installedApps.find(params.id)
  } catch (cause) {
    logger.error('Mini-app lookup failed', { app: params.id, cause })
    return appResponse('Ứng dụng tạm thời không phản hồi. Vui lòng thử lại sau.', 503)
  }
  if (!app) return appResponse('Không có ứng dụng này', 404)
  return forwardToApp(req, app, params.path ?? [], { getToken: getCoreToken, fetchImpl: fetch, clientIp: clientIp(req), isPublicLimited })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
