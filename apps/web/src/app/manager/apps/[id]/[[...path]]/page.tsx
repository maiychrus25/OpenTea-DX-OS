// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { notFound } from 'next/navigation'
import { MiniAppFrame } from '@/components/features/apps/MiniAppFrame'
import { CoreUnavailableError } from '@/domain/errors/CoreUnavailableError'
import { miniAppSrc } from '@/lib/apps/app-nav'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { logger } from '@/lib/logger'

// An app removed while its page is open must answer 404 on the next request.
export const dynamic = 'force-dynamic'

const installedApps = new PrismaInstalledAppRepository()

export default async function ManagerAppPage({ params, searchParams }: {
  params: { id: string; path?: string[] }
  searchParams: Record<string, string | string[] | undefined>
}) {
  // error.tsx shows CORE_UNAVAILABLE as a Vietnamese notice instead of the generic error page.
  const app = await installedApps.find(params.id).catch((cause: unknown) => {
    logger.error('Mini-app lookup failed', { app: params.id, cause })
    throw new CoreUnavailableError()
  })
  const src = app && miniAppSrc(app, 'manager', params.path ?? [], searchParams)
  if (!app || !src) notFound()
  return <MiniAppFrame src={src} title={app.name} />
}
