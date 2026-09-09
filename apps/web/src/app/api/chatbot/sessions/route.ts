// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ChatbotUseCase } from '@/application/chatbot/ChatbotUseCase'
import { PrismaChatHistoryRepository } from '@/infrastructure/db/chat/prisma-chat-history-repository'
import { PrismaMarketDataRepository } from '@/infrastructure/db/market/prisma-market-data-repository'

async function getChatSessions(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (role !== 'manager' && role !== 'officer') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const chatType = (searchParams.get('type') as 'market' | 'technical') || 'market'

  const chatHistoryRepo = new PrismaChatHistoryRepository()
  const marketDataRepo = new PrismaMarketDataRepository()
  const useCase = new ChatbotUseCase(undefined, chatHistoryRepo, marketDataRepo)
  const sessions = await useCase.getSessions(session.user.id!, chatType)

  return NextResponse.json({ data: { sessions } })
}

export const GET = withErrorHandler(getChatSessions)
