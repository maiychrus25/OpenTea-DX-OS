// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { appResponse, forwardToApp } from '@/application/apps/forward-to-app'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { getCoreToken } from '@/lib/auth/core-token'
import { clientIp } from '@/lib/ip-rate-limit'

// Per user and per request: never render or cache this at build time.
export const dynamic = 'force-dynamic'

const installedApps = new PrismaInstalledAppRepository()

async function handle(req: Request, { params }: { params: { id: string; path?: string[] } }): Promise<Response> {
  const app = await installedApps.find(params.id)
  if (!app) return appResponse('Không có ứng dụng này', 404)
  return forwardToApp(req, app, params.path ?? [], { getToken: getCoreToken, fetchImpl: fetch, clientIp: clientIp(req) })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
