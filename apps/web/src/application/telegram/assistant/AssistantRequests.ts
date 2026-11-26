// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AssistantRequestRepository, ExpiredAssistantRequest } from '@/domain/telegram/ports/AssistantRequestRepository'
import type { AssistantSubmitter } from '../chat/ChatEngine'
import type { ChatUser } from '../chat/types'

export const ASSISTANT_TEXT_MAX = 1000
/** An agent heartbeat this recent means the cooperative's agent can take requests (contract C9). */
export const AGENT_ONLINE_MS = 10 * 60 * 1000
/** A request not answered within this time expires and the chat gets the timeout reply (contract C7). */
export const ASSISTANT_TIMEOUT_MS = 60 * 1000

export interface HeartbeatReader {
  heartbeatLastSeen(service: string): Promise<Date | null>
}

/** Requests from the chat to agent A7: created only while the cooperative's agent is online. */
export class AssistantRequests implements AssistantSubmitter {
  constructor(
    private readonly requests: AssistantRequestRepository,
    private readonly heartbeats: HeartbeatReader
  ) {}

  async submit(user: ChatUser, text: string, now: Date): Promise<boolean> {
    if (text.length > ASSISTANT_TEXT_MAX) return false
    if (!(await this.agentOnline(user.tenant.htxCode, now))) return false
    await this.requests.create({
      htxCode: user.tenant.htxCode,
      telegramUserId: user.telegramUserId,
      chatId: String(user.chatId),
      userId: user.tenant.userId,
      role: user.tenant.role,
      text,
    })
    return true
  }

  async agentOnline(htxCode: string, now: Date): Promise<boolean> {
    const seen = await this.heartbeats.heartbeatLastSeen(`agent:${htxCode}`)
    return seen !== null && now.getTime() - seen.getTime() <= AGENT_ONLINE_MS
  }

  expire(now: Date): Promise<ExpiredAssistantRequest[]> {
    return this.requests.expireOlderThan(new Date(now.getTime() - ASSISTANT_TIMEOUT_MS))
  }
}
