// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type {
  AssistantRequestRepository,
  AssistantRequestRow,
  AssistantRequestStatus,
  AssistantRole,
  ExpiredAssistantRequest,
  NewAssistantRequest,
} from '@/domain/telegram/ports/AssistantRequestRepository'
import { prisma } from '@/infrastructure/db/prisma.client'

type RequestDbRow = {
  id: string
  htx_code: string
  telegram_user_id: string
  chat_id: string
  user_id: string
  role: AssistantRole
  text: string
  status: AssistantRequestStatus
  created_at: Date
  run_id: string | null
}

// Prisma.raw: a plain string inside a $queryRaw template is sent as a bound value, not as SQL.
const REQUEST_COLUMNS = Prisma.raw(`id::text AS id, htx_code, telegram_user_id::text AS telegram_user_id,
  chat_id::text AS chat_id, user_id, role, text, status, created_at, run_id::text AS run_id`)

function mapRequest(r: RequestDbRow): AssistantRequestRow {
  return {
    id: r.id,
    htxCode: r.htx_code,
    telegramUserId: r.telegram_user_id,
    chatId: r.chat_id,
    userId: r.user_id,
    role: r.role,
    text: r.text,
    status: r.status,
    createdAt: r.created_at,
    runId: r.run_id,
  }
}

/** Persistence of the assistant requests of the Telegram chat (`platform.assistant_requests`). */
export class PrismaAssistantRequestRepository implements AssistantRequestRepository {
  async create(request: NewAssistantRequest): Promise<string> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO platform.assistant_requests (htx_code, telegram_user_id, chat_id, user_id, role, text)
      VALUES (${request.htxCode}, ${request.telegramUserId}::bigint, ${request.chatId}::bigint, ${request.userId},
              ${request.role}, ${request.text})
      RETURNING id::text AS id
    `
    return rows[0].id
  }

  async claim(htxCode: string, limit: number, now: Date): Promise<AssistantRequestRow[]> {
    const rows = await prisma.$queryRaw<RequestDbRow[]>`
      UPDATE platform.assistant_requests SET status = 'claimed', claimed_at = ${now}
      WHERE id IN (
        SELECT id FROM platform.assistant_requests
        WHERE htx_code = ${htxCode} AND status = 'pending'
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${REQUEST_COLUMNS}
    `
    return rows.map(mapRequest).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async find(id: string): Promise<AssistantRequestRow | null> {
    const rows = await prisma.$queryRaw<RequestDbRow[]>`
      SELECT ${REQUEST_COLUMNS} FROM platform.assistant_requests WHERE id = ${id}::uuid
    `
    return rows[0] ? mapRequest(rows[0]) : null
  }

  async finish(id: string, htxCode: string, status: 'done' | 'failed', runId: string | null): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE platform.assistant_requests
      SET status = ${status}, finished_at = now(), text = '', run_id = ${runId}::uuid
      WHERE id = ${id}::uuid AND htx_code = ${htxCode} AND status = 'claimed'
      RETURNING id::text AS id
    `
    return rows.length > 0
  }

  async expireOlderThan(cutoff: Date): Promise<ExpiredAssistantRequest[]> {
    const rows = await prisma.$queryRaw<{ htx_code: string; chat_id: string; role: AssistantRole }[]>`
      UPDATE platform.assistant_requests
      SET status = 'expired', finished_at = now(), text = ''
      WHERE status IN ('pending', 'claimed') AND created_at < ${cutoff}
      RETURNING htx_code, chat_id::text AS chat_id, role
    `
    return rows.map((r) => ({ htxCode: r.htx_code, chatId: r.chat_id, role: r.role }))
  }
}
