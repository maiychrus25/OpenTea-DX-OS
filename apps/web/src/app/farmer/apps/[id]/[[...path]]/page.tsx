// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { notFound } from 'next/navigation'
import { MiniAppFrame } from '@/components/features/apps/MiniAppFrame'
import { miniAppSrc } from '@/lib/apps/app-nav'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'

// An app removed while its page is open must answer 404 on the next request.
export const dynamic = 'force-dynamic'

const installedApps = new PrismaInstalledAppRepository()

export default async function FarmerAppPage({ params, searchParams }: {
  params: { id: string; path?: string[] }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const app = await installedApps.find(params.id)
  const src = app && miniAppSrc(app, 'farmer', params.path ?? [], searchParams)
  if (!app || !src) notFound()
  return <MiniAppFrame src={src} title={app.name} />
}
