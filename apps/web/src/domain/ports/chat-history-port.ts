// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface ChatMessageEntity {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSessionEntity {
  session_id: string
  title: string
  updated_at: Date
}

export interface ChatHistoryPort {
  /**
   * Persist a new message to the chat history
   */
  persistMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    chatType: 'market' | 'technical',
    sources?: string[]
  ): Promise<void>

  /**
   * Get the last 7 days of history for a specific session
   */
  getHistory(
    userId: string,
    sessionId: string,
    chatType: 'market' | 'technical'
  ): Promise<ChatMessageEntity[]>

  /**
   * Get unique chat sessions for a user in the last 30 days
   */
  getSessions(
    userId: string,
    chatType: 'market' | 'technical'
  ): Promise<ChatSessionEntity[]>
}
