// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ChatbotUseCase } from '@/application/chatbot/ChatbotUseCase'
import { z } from 'zod'

const chatbotSchema = z.object({
  message: z.string().min(1),
  session_id: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional().default([]),
})

async function postChatbot(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  // Auth Matrix §4.2: manager and officer only
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = chatbotSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const useCase = new ChatbotUseCase()
  const userId = session.user.id
  const sessionId = parse.data.session_id || `chat-${userId}-${Date.now()}`

  const stream = await useCase.execute(
    parse.data.message,
    parse.data.history,
    userId,
    sessionId,
  )

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Chat-Session-Id': sessionId,
    },
  })
}

// GET — retrieve chat history
async function getChatHistory(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'session_id required' } }, { status: 400 })
  }

  const useCase = new ChatbotUseCase()
  const history = await useCase.getHistory(session.user.id!, sessionId)

  return NextResponse.json({ data: { history, session_id: sessionId } })
}

export const POST = withErrorHandler(postChatbot)
export const GET = withErrorHandler(getChatHistory)
