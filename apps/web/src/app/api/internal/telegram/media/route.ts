// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { bulletinSpeechText } from '@/application/telegram/chat/speech'
import { SCREENSHOT_NAMES, type BuildFileName } from '@/domain/appbuilder/app-build'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { withAppBuildErrors } from '@/lib/api/app-build-response'

const screenshotQuery = z.object({ build: z.string().uuid(), name: z.enum(SCREENSHOT_NAMES as [BuildFileName, ...BuildFileName[]]) })
const bulletinQuery = z.object({ bulletin: z.string().uuid() })

const json = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status })

/** The bulletin as a WAV file, for the relay's `sendDocument` (issue #80, C4). */
async function bulletinAudio(id: string): Promise<NextResponse> {
  const bulletin = await prisma.bulletin.findFirst({ where: { id, status: 'published' } })
  const text = bulletin ? bulletinSpeechText(bulletin.bulletin_vi) : ''
  if (!text) return json(404, 'NOT_FOUND', 'Không có bản tin này')
  try {
    const reader = (await new PiperTtsAdapter().synthesize(text)).getReader()
    const chunks: Uint8Array[] = []
    for (let part = await reader.read(); !part.done; part = await reader.read()) chunks.push(part.value)
    return new NextResponse(Buffer.concat(chunks) as unknown as BodyInit, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_UNAVAILABLE') return json(503, 'SERVICE_UNAVAILABLE', 'Dịch vụ đọc văn bản tạm ngưng.')
    throw error
  }
}

/**
 * Files for the relay (contract C8). `?build=&name=` is one screenshot of a build for `sendMediaGroup` (only the four PNGs
 * are served); `?bulletin=` is the bulletin read aloud.
 */
async function getMedia(request: Request) {
  await requireTelegramCaller(request)
  const url = new URL(request.url)
  if (url.searchParams.has('bulletin')) return bulletinAudio(bulletinQuery.parse({ bulletin: url.searchParams.get('bulletin') }).bulletin)
  const query = screenshotQuery.parse({ build: url.searchParams.get('build'), name: url.searchParams.get('name') })
  const file = await new PrismaAppBuildRepository().screenshotOfBuild(query.build, query.name)
  if (!file) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không có ảnh này' } }, { status: 404 })
  return new NextResponse(file.bytes as unknown as BodyInit, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'no-store' } })
}

export const GET = withAppBuildErrors(getMedia)
