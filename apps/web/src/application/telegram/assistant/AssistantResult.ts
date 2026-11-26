// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { OutboxInsert } from '@/domain/telegram/ports/TelegramRepository'
import type { AssistantRequestRepository, ExpiredAssistantRequest } from '@/domain/telegram/ports/AssistantRequestRepository'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import type { ChatEngine } from '../chat/ChatEngine'
import type { ChatUserResolver } from '../chat/ChatUserResolver'
import { menuKeyboard } from '../chat/menu'
import type { Intent } from '../chat/types'
import { TELEGRAM_TEXT } from '../messages'
import type { OutboxReply } from '../TelegramUpdateHandler'

export type AssistantResultOutcome = 'ok' | 'not_found' | 'conflict'

export interface AssistantResultDeps {
  requests: AssistantRequestRepository
  links: Pick<TelegramRepository, 'activeUserLinkByTelegramUser'>
  users: Pick<ChatUserResolver, 'resolve'>
  engine: Pick<ChatEngine, 'applyIntent'>
  enqueue(rows: OutboxInsert[]): Promise<void>
}

/** Turns an outbox-style reply into the row the lease sends later. */
export function toOutboxInsert(htxCode: string, reply: OutboxReply): OutboxInsert {
  const base = {
    htxCode,
    chatId: String(reply.chat_id),
    op: reply.op,
    text: reply.text,
    buttons: reply.buttons ?? null,
    purpose: 'reply' as const,
  }
  return reply.op === 'edit' ? { ...base, editMessageId: String(reply.edit_message_id) } : base
}

/** The timeout reply of requests that expired, with the menu of the role (contract C7). */
export function assistantTimeoutInserts(expired: ExpiredAssistantRequest[], callbackKey: string | null): OutboxInsert[] {
  return expired.map((row) => ({
    htxCode: row.htxCode,
    chatId: row.chatId,
    op: 'send' as const,
    text: TELEGRAM_TEXT.assistantTimeout,
    buttons: callbackKey ? menuKeyboard(row.role, callbackKey) : null,
    purpose: 'reply' as const,
  }))
}

/** Accepts the agent's intent for a claimed request: the request is finished first, then its intent runs as the user. */
export class AssistantResultUseCase {
  constructor(private readonly deps: AssistantResultDeps) {}

  async execute(
    htxCode: string,
    requestId: string,
    intent: Intent,
    runId: string | null,
    now: Date
  ): Promise<AssistantResultOutcome> {
    const row = await this.deps.requests.find(requestId)
    if (!row || row.htxCode !== htxCode) return 'not_found'
    if (row.status !== 'claimed') return 'conflict'
    if (!(await this.deps.requests.finish(requestId, htxCode, 'done', runId))) return 'conflict'

    const link = await this.deps.links.activeUserLinkByTelegramUser(row.telegramUserId)
    const user = link ? await this.deps.users.resolve(link) : null
    const replies: OutboxReply[] = user
      ? await this.deps.engine.applyIntent(user, intent, now)
      : [{ op: 'send', chat_id: Number(row.chatId), text: TELEGRAM_TEXT.noPermission('Trợ lý Telegram') }]
    await this.deps.enqueue(replies.map((reply) => toOutboxInsert(htxCode, reply)))
    return 'ok'
  }
}
