// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ttsRequestSchema } from '@/lib/validations/tts.schema'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ValidationError } from '@/domain/errors'

async function postTtsHandler(request: Request) {
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parseResult = ttsRequestSchema.safeParse(body)
  
  if (!parseResult.success) {
    throw new ValidationError('Invalid request body: ' + parseResult.error.message)
  }

  try {
    const adapter = new PiperTtsAdapter()
    const stream = await adapter.synthesize(parseResult.data.text)
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/wav',
      },
    })
  } catch (error: any) {
    if (error.message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ đọc văn bản tạm ngưng.' } },
        { status: 503 }
      )
    }
    throw error
  }
}

export const POST = withErrorHandler(postTtsHandler)
