// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type LinkKind = 'user' | 'group'

export interface TelegramLink {
  id: string
  kind: LinkKind
  userId: string | null
  userName: string | null
  role: string | null
  htxCode: string
  telegramUserId: string | null
  chatId: string
  linkedAt: Date
}

export interface LinkCodeRecord {
  kind: LinkKind
  userId: string
  userName: string | null
  role: string | null
  htxCode: string
}

export interface OutboxInsert {
  htxCode: string | null
  chatId: string
  op: 'send' | 'edit'
  text: string
  buttons?: OutboxButton[][] | null
  editMessageId?: string | null
  proposalId?: string | null
  purpose: 'proposal' | 'result' | 'report' | 'health' | 'reply'
  healthKey?: string | null
}

export type OutboxButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; web_app: { url: string } }

export interface OutboxRow extends OutboxInsert {
  id: string
  attempts: number
  status: 'pending' | 'leased' | 'sent' | 'failed'
  telegramMessageId: string | null
}

export type ConversationKind = 'reject_reason' | 'flow' | 'voice'

/** One open conversation per Telegram user: a reject reason (M2) or a chat flow or card (M5). */
export interface TelegramConversation {
  telegramUserId: string
  kind: ConversationKind
  proposalId: string | null
  /** An action name, or `ask` for a free question to the assistant. */
  flow: string | null
  /** Index into the action's steps; -1 is the first card, -2 the second card. */
  step: number | null
  state: Record<string, unknown>
  /** Random token of the buttons that are live now; a press with another token is stale. */
  token: string | null
  cardMessageId: string | null
  expiresAt: Date
}

export interface RejectConversationInput {
  telegramUserId: string
  proposalId: string
  expiresAt: Date
}

export interface FlowInput {
  telegramUserId: string
  /** Defaults to 'flow'; 'voice' holds a heard sentence until the person confirms it (M15). */
  kind?: 'flow' | 'voice'
  flow: string
  step: number | null
  state: Record<string, unknown>
  token: string | null
  cardMessageId: string | null
  expiresAt: Date
}

export interface TelegramRepository {
  createLinkCode(code: { codeHash: string; expiresAt: Date } & LinkCodeRecord): Promise<void>
  /** Single use: returns the record only when the code was unused and unexpired, and marks it used. */
  consumeLinkCode(codeHash: string, now: Date): Promise<LinkCodeRecord | null>
  activeUserLinkByTelegramUser(telegramUserId: string): Promise<TelegramLink | null>
  activeUserLinkByUser(userId: string): Promise<TelegramLink | null>
  activeGroupLinkByHtx(htxCode: string): Promise<TelegramLink | null>
  /** Replaces any active user link of this Telegram account or this user with the new one. */
  replaceUserLink(link: Omit<TelegramLink, 'id' | 'linkedAt' | 'kind' | 'telegramUserId'> & { telegramUserId: string }): Promise<void>
  unlinkUser(filter: { telegramUserId?: string; userId?: string }): Promise<number>
  /** Replaces the cooperative's group link (and any other link of this chat). */
  replaceGroupLink(link: { htxCode: string; chatId: string }): Promise<void>
  /** Active user links of a cooperative with one of the given roles, or all cooperatives when htxCode is null. */
  userLinkRecipients(htxCode: string | null, roles: readonly string[]): Promise<TelegramLink[]>
  groupLinkRecipients(htxCode: string | null): Promise<TelegramLink[]>

  setConversation(conversation: RejectConversationInput): Promise<void>
  /** The open conversation, or null when it has expired. */
  activeConversation(telegramUserId: string, now: Date): Promise<TelegramConversation | null>
  /** The conversation whatever its expiry, so a late button press can be answered as expired. */
  conversationOf(telegramUserId: string): Promise<TelegramConversation | null>
  /** Starts or replaces the user's chat flow or card (replaces a reject reason too). */
  setFlow(flow: FlowInput): Promise<void>
  deleteConversation(telegramUserId: string): Promise<void>

  /** Records the update id; the Telegram user (null for channel posts) is kept for the hourly rate limit. */
  markUpdateSeen(updateId: string, telegramUserId: string | null): Promise<boolean>
  forgetUpdate(updateId: string): Promise<void>
  /** Updates seen since `since` from this Telegram user, counting the current one. */
  countRecentUpdates(telegramUserId: string, since: Date): Promise<number>
  /** Writes one row of the audit chain, with the actor set for the trigger rows of the same transaction. */
  auditEvent(actor: string, op: string, subject: string, details: Record<string, unknown>): Promise<void>

  enqueue(rows: OutboxInsert[]): Promise<void>
  lease(limit: number, now: Date, leaseSeconds: number): Promise<OutboxRow[]>
  outboxRow(id: string): Promise<OutboxRow | null>
  markSent(id: string, telegramMessageId: string | null): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void>
  /** The `send` rows of a proposal, one per approver message, in any status. */
  proposalSends(proposalId: string): Promise<OutboxRow[]>
  /** Rewrites a proposal message that has not been sent yet, so it goes out already showing the decision. */
  updateUnsentText(id: string, text: string): Promise<void>
  healthRecentlyQueued(healthKey: string, since: Date): Promise<boolean>

  /** `details` replaces the stored details only when given (the agent sends its provider list). */
  touchHeartbeat(service: string, version: string | null, details?: Record<string, unknown> | null): Promise<void>
  heartbeatLastSeen(service: string): Promise<Date | null>
  heartbeatServices(prefix: string): Promise<string[]>
  /** Whether the latest `count` runs of this cooperative all failed (fewer runs never qualify). */
  lastRunsAllFailed(htxCode: string, count: number): Promise<boolean>
  unnotifiedAlerts(limit: number): Promise<{ id: string; htxCode: string | null; title: string; detail: string | null }[]>
  markAlertsNotified(ids: string[], now: Date): Promise<void>

  insertReportIfNew(htxCode: string, kind: 'daily' | 'weekly', periodStart: string): Promise<boolean>
  /** Proposals of a cooperative that are open now, and those decided in [start, end). */
  proposalCounts(htxCode: string, periodStart: Date, periodEnd: Date): Promise<{ open: number; decided: number }>
  /** Cooperatives with the agent enabled; only these are expected to send heartbeats and runs. */
  enabledAgentCooperatives(): Promise<string[]>
}
