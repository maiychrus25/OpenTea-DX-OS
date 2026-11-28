// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import removeMd from 'remove-markdown'
import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'
import { ttsRequestSchema } from '@/lib/validations/tts.schema'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ValidationError } from '@/domain/errors'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { TtsCache } from '@/infrastructure/tts/tts-cache'
import { createUserLimiter } from '@/infrastructure/tts/tts-limit'
import { logger } from '@/lib/logger'

const isRateLimited = createUserLimiter({ max: 20, windowMs: 60_000 })

const AUDIO_HEADERS = { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' }

function rateLimited() {
  return NextResponse.json(
    { error: { code: 'RATE_LIMITED', message: 'Bạn nghe nhiều quá, thử lại sau một phút.' } },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}

/** Audio for the text: from the cache when it is there, else from Piper and stored. A cache fault never stops the voice. */
async function speak(text: string) {
  const voice = process.env.PIPER_VOICE || 'vi'
  const cache = new TtsCache(new MinioDocumentAdapter())
  try {
    const hit = await cache.get(voice, text)
    if (hit) return new NextResponse(new Uint8Array(hit), { headers: AUDIO_HEADERS })
  } catch (error) {
    logger.error('TTS cache read failed', { error })
  }
  const audio = Buffer.from(await new Response(await new PiperTtsAdapter().synthesize(text)).arrayBuffer())
  try {
    await cache.put(voice, text, audio)
  } catch (error) {
    logger.error('TTS cache write failed', { error })
  }
  return new NextResponse(new Uint8Array(audio), { headers: AUDIO_HEADERS })
}

async function postTtsHandler(request: Request) {
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  if (isRateLimited(session.user.id ?? session.user.email ?? 'unknown')) return rateLimited()

  const body = await request.json().catch(() => ({}))
  const parseResult = ttsRequestSchema.safeParse(body)
  
  if (!parseResult.success) {
    throw new ValidationError('Invalid request body: ' + parseResult.error.message)
  }

  try {
    return await speak(parseResult.data.text)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đọc văn bản tạm ngưng.' } },
        { status: 503 }
      )
    }
    throw error
  }
}

export const POST = withErrorHandler(postTtsHandler)

async function getTtsHandler(request: Request) {
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  if (isRateLimited(session.user.id ?? session.user.email ?? 'unknown')) return rateLimited()

  const url = new URL(request.url)
  const bulletinId = url.searchParams.get('bulletinId')

  if (!bulletinId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'bulletinId is required' } }, { status: 400 })
  }

  // Same visibility as the bulletin readers: published, and the cooperative's own or a shared row.
  const htxCode = session.user.htxCode
  const bulletin = await prisma.bulletin.findFirst({
    where: {
      id: bulletinId,
      status: 'published',
      OR: [{ htx_code: null }, ...(htxCode ? [{ htx_code: htxCode }] : [])],
    },
  })

  if (!bulletin) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Bulletin not found' } }, { status: 404 })
  }

  const plainText = removeMd(bulletin.bulletin_vi)

  try {
    return await speak(plainText)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đọc văn bản tạm ngưng.' } },
        { status: 503 }
      )
    }
    throw error
  }
}

export const GET = withErrorHandler(getTtsHandler)
