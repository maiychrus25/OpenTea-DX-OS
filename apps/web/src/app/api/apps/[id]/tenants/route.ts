// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { createPublicReadLimiter } from '@/application/apps/forward-to-app'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { clientIp } from '@/lib/ip-rate-limit'
import { logger } from '@/lib/logger'

// Per request, from the database: never render or cache this at build time.
export const dynamic = 'force-dynamic'

const installedApps = new PrismaInstalledAppRepository()
// shortcut: its own counter (same limit and window as the proxy's public reads), not the proxy's, since routes may not share module state
const isLimited = createPublicReadLimiter()

const NO_STORE = { 'cache-control': 'no-store' }
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE })

/** Public: the cooperatives that enabled a mini-app with public routes, so the mobile app can offer a picker (names are public on /htx/<code>). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (isLimited(clientIp(req))) return fail(429, 'RATE_LIMIT_EXCEEDED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau một phút.')
  try {
    const app = await installedApps.find(params.id)
    if (!app || app.publicPrefixes.length === 0) return fail(404, 'NOT_FOUND', 'Không có ứng dụng này')
    return NextResponse.json({ items: await installedApps.listTenants(app.id) }, { headers: NO_STORE })
  } catch (cause) {
    logger.error('Tenant directory lookup failed', { app: params.id, cause })
    return fail(503, 'UNAVAILABLE', 'Ứng dụng tạm thời không phản hồi. Vui lòng thử lại sau.')
  }
}
