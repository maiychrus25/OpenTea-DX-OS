// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  FlowInput,
  LinkCodeRecord,
  OutboxButton,
  OutboxInsert,
  OutboxRow,
  RejectConversationInput,
  TelegramConversation,
  TelegramLink,
  TelegramRepository,
} from '@/domain/telegram/ports/TelegramRepository'
import { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'

type LinkRow = {
  id: string
  kind: 'user' | 'group'
  user_id: string | null
  user_name: string | null
  role: string | null
  htx_code: string
  telegram_user_id: string | null
  chat_id: string
  linked_at: Date
}

type OutboxDbRow = {
  id: string
  htx_code: string | null
  chat_id: string
  op: 'send' | 'edit'
  text: string
  buttons: OutboxButton[][] | null
  edit_message_id: string | null
  proposal_id: string | null
  purpose: OutboxRow['purpose']
  health_key: string | null
  status: OutboxRow['status']
  attempts: number
  telegram_message_id: string | null
}

// Prisma.raw: a plain string inside a $queryRaw template is sent as a bound value, not as SQL.
const LINK_COLUMNS = Prisma.raw(`id::text AS id, kind, user_id, user_name, role, htx_code,
  telegram_user_id::text AS telegram_user_id, chat_id::text AS chat_id, linked_at`)

const OUTBOX_COLUMNS = Prisma.raw(`id::text AS id, htx_code, chat_id::text AS chat_id, op, text, buttons,
  edit_message_id::text AS edit_message_id, proposal_id::text AS proposal_id, purpose, health_key,
  status, attempts, telegram_message_id::text AS telegram_message_id`)

type ConversationRow = {
  telegram_user_id: string
  kind: TelegramConversation['kind']
  proposal_id: string | null
  flow: string | null
  step: number | null
  state: Record<string, unknown>
  token: string | null
  card_message_id: string | null
  expires_at: Date
}

const CONVERSATION_COLUMNS = Prisma.raw(`telegram_user_id::text AS telegram_user_id, kind, proposal_id::text AS proposal_id,
  flow, step, state, token, card_message_id::text AS card_message_id, expires_at`)

function mapConversation(r: ConversationRow): TelegramConversation {
  return {
    telegramUserId: r.telegram_user_id,
    kind: r.kind,
    proposalId: r.proposal_id,
    flow: r.flow,
    step: r.step,
    state: r.state ?? {},
    token: r.token,
    cardMessageId: r.card_message_id,
    expiresAt: r.expires_at,
  }
}

function mapLink(r: LinkRow): TelegramLink {
  return {
    id: r.id,
    kind: r.kind,
    userId: r.user_id,
    userName: r.user_name,
    role: r.role,
    htxCode: r.htx_code,
    telegramUserId: r.telegram_user_id,
    chatId: r.chat_id,
    linkedAt: r.linked_at,
  }
}

function mapOutbox(r: OutboxDbRow): OutboxRow {
  return {
    id: r.id,
    htxCode: r.htx_code,
    chatId: r.chat_id,
    op: r.op,
    text: r.text,
    buttons: r.buttons,
    editMessageId: r.edit_message_id,
    proposalId: r.proposal_id,
    purpose: r.purpose,
    healthKey: r.health_key,
    status: r.status,
    attempts: r.attempts,
    telegramMessageId: r.telegram_message_id,
  }
}

/** Persistence adapter for the `platform.telegram_*` tables and the service heartbeats and alerts. */
export class PrismaTelegramRepository implements TelegramRepository {
  /** Every write runs in a transaction that names its actor for the audit trail. */
  private write<T>(actor: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      return fn(tx)
    })
  }

  async createLinkCode(code: LinkCodeRecord & { codeHash: string; expiresAt: Date }): Promise<void> {
    await this.write(`user:${code.userId}`, (tx) => tx.$executeRaw`
      INSERT INTO platform.telegram_link_codes (code_hash, kind, user_id, user_name, role, htx_code, expires_at)
      VALUES (${code.codeHash}, ${code.kind}, ${code.userId}, ${code.userName}, ${code.role}, ${code.htxCode}, ${code.expiresAt})
    `)
  }

  async consumeLinkCode(codeHash: string, now: Date): Promise<LinkCodeRecord | null> {
    const rows = await this.write('telegram:link', (tx) => tx.$queryRaw<
      { kind: 'user' | 'group'; user_id: string; user_name: string | null; role: string | null; htx_code: string }[]
    >`
      UPDATE platform.telegram_link_codes
      SET used_at = now()
      WHERE code_hash = ${codeHash} AND used_at IS NULL AND expires_at > ${now}
      RETURNING kind, user_id, user_name, role, htx_code
    `)
    const row = rows[0]
    return row
      ? { kind: row.kind, userId: row.user_id, userName: row.user_name, role: row.role, htxCode: row.htx_code }
      : null
  }

  async activeUserLinkByTelegramUser(telegramUserId: string): Promise<TelegramLink | null> {
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT ${LINK_COLUMNS} FROM platform.telegram_links
      WHERE kind = 'user' AND unlinked_at IS NULL AND telegram_user_id = ${telegramUserId}::bigint
      LIMIT 1
    `
    return rows[0] ? mapLink(rows[0]) : null
  }

  async activeUserLinkByUser(userId: string): Promise<TelegramLink | null> {
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT ${LINK_COLUMNS} FROM platform.telegram_links
      WHERE kind = 'user' AND unlinked_at IS NULL AND user_id = ${userId}
      LIMIT 1
    `
    return rows[0] ? mapLink(rows[0]) : null
  }

  async activeGroupLinkByHtx(htxCode: string): Promise<TelegramLink | null> {
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT ${LINK_COLUMNS} FROM platform.telegram_links
      WHERE kind = 'group' AND unlinked_at IS NULL AND htx_code = ${htxCode}
      LIMIT 1
    `
    return rows[0] ? mapLink(rows[0]) : null
  }

  async replaceUserLink(link: {
    userId: string | null
    userName: string | null
    role: string | null
    htxCode: string
    telegramUserId: string
    chatId: string
  }): Promise<void> {
    await this.write(`user:${link.userId}`, async (tx) => {
      await tx.$executeRaw`
        UPDATE platform.telegram_links SET unlinked_at = now()
        WHERE kind = 'user' AND unlinked_at IS NULL
          AND (telegram_user_id = ${link.telegramUserId}::bigint OR user_id = ${link.userId})
      `
      await tx.$executeRaw`
        INSERT INTO platform.telegram_links (kind, user_id, user_name, role, htx_code, telegram_user_id, chat_id)
        VALUES ('user', ${link.userId}, ${link.userName}, ${link.role}, ${link.htxCode},
                ${link.telegramUserId}::bigint, ${link.chatId}::bigint)
      `
    })
  }

  async unlinkUser(filter: { telegramUserId?: string; userId?: string }): Promise<number> {
    const rows = await this.write(`user:${filter.userId ?? filter.telegramUserId}`, (tx) => tx.$queryRaw<{ id: string }[]>`
      UPDATE platform.telegram_links SET unlinked_at = now()
      WHERE kind = 'user' AND unlinked_at IS NULL
        AND (telegram_user_id = ${filter.telegramUserId ?? null}::bigint OR user_id = ${filter.userId ?? null}::text)
      RETURNING id::text AS id
    `)
    return rows.length
  }

  async replaceGroupLink(link: { htxCode: string; chatId: string }): Promise<void> {
    await this.write('telegram:group', async (tx) => {
      await tx.$executeRaw`
        UPDATE platform.telegram_links SET unlinked_at = now()
        WHERE kind = 'group' AND unlinked_at IS NULL
          AND (htx_code = ${link.htxCode} OR chat_id = ${link.chatId}::bigint)
      `
      await tx.$executeRaw`
        INSERT INTO platform.telegram_links (kind, htx_code, chat_id)
        VALUES ('group', ${link.htxCode}, ${link.chatId}::bigint)
      `
    })
  }

  async userLinkRecipients(htxCode: string | null, roles: readonly string[]): Promise<TelegramLink[]> {
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT ${LINK_COLUMNS} FROM platform.telegram_links
      WHERE kind = 'user' AND unlinked_at IS NULL
        AND (${htxCode}::text IS NULL OR htx_code = ${htxCode})
        AND role = ANY(${[...roles]}::text[])
    `
    return rows.map(mapLink)
  }

  async groupLinkRecipients(htxCode: string | null): Promise<TelegramLink[]> {
    const rows = await prisma.$queryRaw<LinkRow[]>`
      SELECT ${LINK_COLUMNS} FROM platform.telegram_links
      WHERE kind = 'group' AND unlinked_at IS NULL
        AND (${htxCode}::text IS NULL OR htx_code = ${htxCode})
    `
    return rows.map(mapLink)
  }

  async setConversation(conversation: RejectConversationInput): Promise<void> {
    await this.write(`telegram:user:${conversation.telegramUserId}`, (tx) => tx.$executeRaw`
      INSERT INTO platform.telegram_conversations (telegram_user_id, kind, proposal_id, expires_at)
      VALUES (${conversation.telegramUserId}::bigint, 'reject_reason', ${conversation.proposalId}::uuid, ${conversation.expiresAt})
      ON CONFLICT (telegram_user_id) DO UPDATE
        SET kind = EXCLUDED.kind, proposal_id = EXCLUDED.proposal_id, expires_at = EXCLUDED.expires_at,
            flow = NULL, step = NULL, state = '{}'::jsonb, token = NULL, card_message_id = NULL
    `)
  }

  async setFlow(flow: FlowInput): Promise<void> {
    const state = JSON.stringify(flow.state)
    await this.write(`telegram:user:${flow.telegramUserId}`, (tx) => tx.$executeRaw`
      INSERT INTO platform.telegram_conversations (telegram_user_id, kind, proposal_id, expires_at, flow, step, state, token, card_message_id)
      VALUES (${flow.telegramUserId}::bigint, ${flow.kind ?? 'flow'}, NULL, ${flow.expiresAt}, ${flow.flow}, ${flow.step}, ${state}::jsonb,
              ${flow.token}, ${flow.cardMessageId}::bigint)
      ON CONFLICT (telegram_user_id) DO UPDATE
        SET kind = EXCLUDED.kind, proposal_id = NULL, expires_at = EXCLUDED.expires_at, flow = EXCLUDED.flow,
            step = EXCLUDED.step, state = EXCLUDED.state, token = EXCLUDED.token, card_message_id = EXCLUDED.card_message_id
    `)
  }

  async activeConversation(telegramUserId: string, now: Date): Promise<TelegramConversation | null> {
    const rows = await prisma.$queryRaw<ConversationRow[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM platform.telegram_conversations
      WHERE telegram_user_id = ${telegramUserId}::bigint AND expires_at > ${now}
    `
    return rows[0] ? mapConversation(rows[0]) : null
  }

  async conversationOf(telegramUserId: string): Promise<TelegramConversation | null> {
    const rows = await prisma.$queryRaw<ConversationRow[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM platform.telegram_conversations
      WHERE telegram_user_id = ${telegramUserId}::bigint
    `
    return rows[0] ? mapConversation(rows[0]) : null
  }

  async deleteConversation(telegramUserId: string): Promise<void> {
    await this.write(`telegram:user:${telegramUserId}`, (tx) => tx.$executeRaw`
      DELETE FROM platform.telegram_conversations WHERE telegram_user_id = ${telegramUserId}::bigint
    `)
  }

  async markUpdateSeen(updateId: string, telegramUserId: string | null): Promise<boolean> {
    const rows = await this.write('telegram:relay', (tx) => tx.$queryRaw<{ update_id: string }[]>`
      INSERT INTO platform.telegram_updates_seen (update_id, telegram_user_id)
      VALUES (${updateId}::bigint, ${telegramUserId}::bigint)
      ON CONFLICT (update_id) DO NOTHING
      RETURNING update_id::text AS update_id
    `)
    return rows.length > 0
  }

  async countRecentUpdates(telegramUserId: string, since: Date): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.telegram_updates_seen
      WHERE telegram_user_id = ${telegramUserId}::bigint AND seen_at > ${since}
    `
    return rows[0]?.count ?? 0
  }

  async auditEvent(actor: string, op: string, subject: string, details: Record<string, unknown>): Promise<void> {
    const json = JSON.stringify({ ...details, actor })
    await this.write(`user:${actor}`, (tx) => tx.$executeRaw`
      SELECT audit.record_event('web', ${op}, ${subject}, ${json}::jsonb)
    `)
  }

  async forgetUpdate(updateId: string): Promise<void> {
    await this.write('telegram:relay', (tx) => tx.$executeRaw`
      DELETE FROM platform.telegram_updates_seen WHERE update_id = ${updateId}::bigint
    `)
  }

  async enqueue(rows: OutboxInsert[]): Promise<void> {
    if (rows.length === 0) return
    await this.write('system:web', async (tx) => {
      for (const row of rows) {
        const buttons = row.buttons ? JSON.stringify(row.buttons) : null
        await tx.$executeRaw`
          INSERT INTO platform.telegram_outbox (
            htx_code, chat_id, op, text, buttons, edit_message_id, proposal_id, purpose, health_key
          ) VALUES (
            ${row.htxCode ?? null}, ${row.chatId}::bigint, ${row.op}, ${row.text}, ${buttons}::jsonb,
            ${row.editMessageId ?? null}::bigint, ${row.proposalId ?? null}::uuid, ${row.purpose}, ${row.healthKey ?? null}
          )
        `
      }
    })
  }

  async lease(limit: number, now: Date, leaseSeconds: number): Promise<OutboxRow[]> {
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000)
    const rows = await this.write('telegram:relay', (tx) => tx.$queryRaw<OutboxDbRow[]>`
      UPDATE platform.telegram_outbox
      SET status = 'leased', lease_until = ${leaseUntil}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM platform.telegram_outbox
        WHERE (status = 'pending' AND next_attempt_at <= ${now})
           OR (status = 'leased' AND lease_until <= ${now})
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${OUTBOX_COLUMNS}
    `)
    return rows.map(mapOutbox)
  }

  async outboxRow(id: string): Promise<OutboxRow | null> {
    const rows = await prisma.$queryRaw<OutboxDbRow[]>`
      SELECT ${OUTBOX_COLUMNS} FROM platform.telegram_outbox WHERE id = ${id}::uuid
    `
    return rows[0] ? mapOutbox(rows[0]) : null
  }

  async markSent(id: string, telegramMessageId: string | null): Promise<void> {
    await this.write('telegram:relay', (tx) => tx.$executeRaw`
      UPDATE platform.telegram_outbox
      SET status = 'sent', sent_at = now(), lease_until = NULL, last_error = NULL,
          telegram_message_id = ${telegramMessageId}::bigint
      WHERE id = ${id}::uuid
    `)
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.write('telegram:relay', (tx) => tx.$executeRaw`
      UPDATE platform.telegram_outbox SET status = 'failed', lease_until = NULL, last_error = ${error}
      WHERE id = ${id}::uuid
    `)
  }

  async markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.write('telegram:relay', (tx) => tx.$executeRaw`
      UPDATE platform.telegram_outbox
      SET status = 'pending', lease_until = NULL, last_error = ${error}, next_attempt_at = ${nextAttemptAt}
      WHERE id = ${id}::uuid
    `)
  }

  async proposalSends(proposalId: string): Promise<OutboxRow[]> {
    const rows = await prisma.$queryRaw<OutboxDbRow[]>`
      SELECT ${OUTBOX_COLUMNS} FROM platform.telegram_outbox
      WHERE proposal_id = ${proposalId}::uuid AND op = 'send'
    `
    return rows.map(mapOutbox)
  }

  async updateUnsentText(id: string, text: string): Promise<void> {
    await this.write('system:web', (tx) => tx.$executeRaw`
      UPDATE platform.telegram_outbox SET text = ${text}, buttons = NULL
      WHERE id = ${id}::uuid AND status = 'pending'
    `)
  }

  async healthRecentlyQueued(healthKey: string, since: Date): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM platform.telegram_outbox
      WHERE health_key = ${healthKey} AND created_at >= ${since}
      LIMIT 1
    `
    return rows.length > 0
  }

  async touchHeartbeat(service: string, version: string | null, details?: Record<string, unknown> | null): Promise<void> {
    const detailsJson = details ? JSON.stringify(details) : null
    await this.write(`service:${service}`, (tx) => tx.$executeRaw`
      INSERT INTO platform.service_heartbeats (service, last_seen_at, version, details)
      VALUES (${service}, now(), ${version}, ${detailsJson}::jsonb)
      ON CONFLICT (service) DO UPDATE SET last_seen_at = now(), version = EXCLUDED.version,
        details = COALESCE(EXCLUDED.details, platform.service_heartbeats.details)
    `)
  }

  async heartbeatLastSeen(service: string): Promise<Date | null> {
    const rows = await prisma.$queryRaw<{ last_seen_at: Date }[]>`
      SELECT last_seen_at FROM platform.service_heartbeats WHERE service = ${service}
    `
    return rows[0]?.last_seen_at ?? null
  }

  async heartbeatServices(prefix: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ service: string }[]>`
      SELECT service FROM platform.service_heartbeats WHERE service LIKE ${`${prefix}%`}
    `
    return rows.map((r) => r.service)
  }

  async lastRunsAllFailed(htxCode: string, count: number): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM platform.agent_runs
      WHERE htx_code = ${htxCode}
      ORDER BY started_at DESC
      LIMIT ${count}
    `
    return rows.length === count && rows.every((r) => r.status === 'failed')
  }

  async unnotifiedAlerts(limit: number): Promise<{ id: string; htxCode: string | null; title: string; detail: string | null }[]> {
    const rows = await prisma.$queryRaw<{ id: string; htx_code: string | null; title: string; detail: string | null }[]>`
      SELECT id::text AS id, htx_code, title, detail FROM platform.system_alerts
      WHERE notified_at IS NULL
      ORDER BY created_at
      LIMIT ${limit}
    `
    return rows.map((r) => ({ id: r.id, htxCode: r.htx_code, title: r.title, detail: r.detail }))
  }

  async markAlertsNotified(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return
    await this.write('system:web', (tx) => tx.$executeRaw`
      UPDATE platform.system_alerts SET notified_at = ${now} WHERE id = ANY(${ids}::uuid[])
    `)
  }

  async proposalCounts(htxCode: string, periodStart: Date, periodEnd: Date): Promise<{ open: number; decided: number }> {
    const rows = await prisma.$queryRaw<{ open: number; decided: number }[]>`
      SELECT
        count(*) FILTER (WHERE status = 'proposed' AND expires_at > now())::int AS open,
        count(*) FILTER (WHERE decided_at >= ${periodStart} AND decided_at < ${periodEnd})::int AS decided
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode}
    `
    return { open: rows[0]?.open ?? 0, decided: rows[0]?.decided ?? 0 }
  }

  async enabledAgentCooperatives(): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ htx_code: string }[]>`
      SELECT DISTINCT htx_code FROM platform.agent_settings WHERE enabled = true
    `
    return rows.map((r) => r.htx_code)
  }

  async insertReportIfNew(htxCode: string, kind: 'daily' | 'weekly', periodStart: string): Promise<boolean> {
    const rows = await this.write('agent:reports', (tx) => tx.$queryRaw<{ htx_code: string }[]>`
      INSERT INTO platform.agent_reports (htx_code, kind, period_start)
      VALUES (${htxCode}, ${kind}, ${periodStart}::date)
      ON CONFLICT (htx_code, kind, period_start) DO NOTHING
      RETURNING htx_code
    `)
    return rows.length > 0
  }
}
