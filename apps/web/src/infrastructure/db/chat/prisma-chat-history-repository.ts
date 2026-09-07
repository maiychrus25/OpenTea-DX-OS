// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { ChatHistoryPort, ChatMessageEntity, ChatSessionEntity } from '@/domain/ports/chat-history-port'
import { logger } from '@/lib/logger'

export class PrismaChatHistoryRepository implements ChatHistoryPort {
  async persistMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    chatType: 'market' | 'technical',
    sources?: string[]
  ): Promise<void> {
    try {
      await prisma.chatHistory.create({
        data: {
          session_id: sessionId,
          user_id: userId,
          role: role === 'user' ? 'USER' : 'ASSISTANT',
          content,
          chat_type: chatType,
          ...(sources ? { sources_json: sources } : {}),
        },
      })
    } catch (err) {
      logger.error('Failed to persist chat message', { error: err })
    }
  }

  async getHistory(userId: string, sessionId: string, chatType: 'market' | 'technical'): Promise<ChatMessageEntity[]> {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const records = await prisma.chatHistory.findMany({
      where: {
        user_id: userId,
        session_id: sessionId,
        chat_type: chatType,
        created_at: { gte: sevenDaysAgo },
      },
      orderBy: { created_at: 'asc' },
      take: 50,
    })

    return records.map(r => ({
      role: r.role === 'USER' ? 'user' : 'assistant',
      content: r.content,
    }))
  }

  async getSessions(userId: string, chatType: 'market' | 'technical'): Promise<ChatSessionEntity[]> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const records = await prisma.chatHistory.findMany({
      where: {
        user_id: userId,
        chat_type: chatType,
        role: 'USER',
        created_at: { gte: thirtyDaysAgo },
      },
      distinct: ['session_id'],
      orderBy: { created_at: 'desc' },
      select: {
        session_id: true,
        content: true,
        created_at: true,
      },
      take: 20,
    })

    return records.map(r => ({
      session_id: r.session_id,
      title: r.content.length > 40 ? r.content.substring(0, 40) + '...' : r.content,
      updated_at: r.created_at,
    }))
  }
}
