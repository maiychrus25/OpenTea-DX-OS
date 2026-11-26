// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SCREENSHOT_NAMES, type BuildFileName } from '@/domain/appbuilder/app-build'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { withAppBuildErrors } from '@/lib/api/app-build-response'

const querySchema = z.object({ build: z.string().uuid(), name: z.enum(SCREENSHOT_NAMES as [BuildFileName, ...BuildFileName[]]) })

/** One screenshot of a build for the relay's `sendMediaGroup` (contract C8). Only the four PNGs are served. */
async function getMedia(request: Request) {
  await requireTelegramCaller(request)
  const url = new URL(request.url)
  const query = querySchema.parse({ build: url.searchParams.get('build'), name: url.searchParams.get('name') })
  const file = await new PrismaAppBuildRepository().screenshotOfBuild(query.build, query.name)
  if (!file) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không có ảnh này' } }, { status: 404 })
  return new NextResponse(file.bytes as unknown as BodyInit, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'no-store' } })
}

export const GET = withAppBuildErrors(getMedia)
