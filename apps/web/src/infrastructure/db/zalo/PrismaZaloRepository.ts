// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type {
  ConsentSource, ConsentState, ConsentStatus, DeliveryFilter, OutboxInsert, OutboxRow, StoredCredentials,
  ZaloRecipient, ZaloRepository, ZaloSettings, ZaloTemplate,
} from '@/domain/zalo/ports/ZaloRepository'
import { ZALO_EVENT_KINDS, type SkipReason, type TemplateKey, type ZaloEventKind } from '@/domain/zalo/zalo-events'

type OutboxDbRow = {
  id: string
  htx_code: string
  event_kind: ZaloEventKind
  event_id: string
  household_id: string
  phone: string
  template_key: TemplateKey
  params: Record<string, string>
  status: OutboxRow['status']
  attempts: number
  next_attempt_at: Date
  last_error: string | null
  created_at: Date
  sent_at: Date | null
}

// Prisma.raw: a plain string inside a $queryRaw template is sent as a bound value, not as SQL.
const OUTBOX_COLUMNS = Prisma.raw(`id::text AS id, htx_code, event_kind, event_id, household_id, phone, template_key, params,
  status, attempts, next_attempt_at, last_error, created_at, sent_at`)

function mapRow(r: OutboxDbRow): OutboxRow {
  return {
    id: r.id, htxCode: r.htx_code, eventKind: r.event_kind, eventId: r.event_id, householdId: r.household_id, phone: r.phone,
    templateKey: r.template_key, params: r.params ?? {}, status: r.status, attempts: r.attempts, nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error, createdAt: r.created_at, sentAt: r.sent_at,
  }
}

const DEFAULT_SETTINGS: ZaloSettings = { enabled: false, kinds: [...ZALO_EVENT_KINDS], quietStartHour: 21, quietEndHour: 6, monthlyQuota: 2000 }

/** Persistence adapter for the `platform.zalo_*` tables; households are read from the public schema. */
export class PrismaZaloRepository implements ZaloRepository {
  /** Every write runs in a transaction that names its actor for the audit trail. */
  private write<T>(actor: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      return fn(tx)
    })
  }

  async settings(htxCode: string): Promise<ZaloSettings> {
    const rows = await prisma.$queryRaw<{ enabled: boolean; kinds: ZaloEventKind[]; quiet_start_hour: number; quiet_end_hour: number; monthly_quota: number }[]>`
      SELECT enabled, kinds, quiet_start_hour, quiet_end_hour, monthly_quota FROM platform.zalo_settings WHERE htx_code = ${htxCode}`
    const r = rows[0]
    return r ? { enabled: r.enabled, kinds: r.kinds, quietStartHour: r.quiet_start_hour, quietEndHour: r.quiet_end_hour, monthlyQuota: r.monthly_quota } : DEFAULT_SETTINGS
  }

  async saveSettings(htxCode: string, s: ZaloSettings, actor: string): Promise<void> {
    await this.write(actor, (tx) => tx.$executeRaw`
      INSERT INTO platform.zalo_settings (htx_code, enabled, kinds, quiet_start_hour, quiet_end_hour, monthly_quota)
      VALUES (${htxCode}, ${s.enabled}, ${s.kinds}::text[], ${s.quietStartHour}, ${s.quietEndHour}, ${s.monthlyQuota})
      ON CONFLICT (htx_code) DO UPDATE SET enabled = EXCLUDED.enabled, kinds = EXCLUDED.kinds,
        quiet_start_hour = EXCLUDED.quiet_start_hour, quiet_end_hour = EXCLUDED.quiet_end_hour,
        monthly_quota = EXCLUDED.monthly_quota, updated_at = now()`)
  }

  async templates(): Promise<ZaloTemplate[]> {
    const rows = await prisma.$queryRaw<{ template_key: TemplateKey; zns_template_id: string; params: string[] }[]>`
      SELECT template_key, zns_template_id, params FROM platform.zalo_templates ORDER BY template_key`
    return rows.map((r) => ({ templateKey: r.template_key, znsTemplateId: r.zns_template_id, params: r.params }))
  }

  async saveTemplates(templates: ZaloTemplate[], actor: string): Promise<void> {
    await this.write(actor, async (tx) => {
      for (const t of templates) {
        await tx.$executeRaw`
          INSERT INTO platform.zalo_templates (template_key, zns_template_id, params)
          VALUES (${t.templateKey}, ${t.znsTemplateId}, ${t.params}::text[])
          ON CONFLICT (template_key) DO UPDATE SET zns_template_id = EXCLUDED.zns_template_id, params = EXCLUDED.params, updated_at = now()`
      }
    })
  }

  async recipients(htxCode: string, householdId: string | null): Promise<ZaloRecipient[]> {
    return prisma.$queryRaw<ZaloRecipient[]>`
      SELECT h.id, h.name, h.phone FROM public.households h
      JOIN public.htx_profiles p ON p.id = h.htx_profile_id
      WHERE p.htx_code = ${htxCode} AND (${householdId}::text IS NULL OR h.id = ${householdId})
      ORDER BY h.id`
  }

  async household(htxCode: string, householdId: string): Promise<{ id: string; phone: string; keycloakUserId: string | null } | null> {
    const rows = await prisma.$queryRaw<{ id: string; phone: string; keycloak_user_id: string | null }[]>`
      SELECT h.id, h.phone, h.keycloak_user_id FROM public.households h
      JOIN public.htx_profiles p ON p.id = h.htx_profile_id
      WHERE p.htx_code = ${htxCode} AND h.id = ${householdId}`
    return rows[0] ? { id: rows[0].id, phone: rows[0].phone, keycloakUserId: rows[0].keycloak_user_id } : null
  }

  async latestConsents(householdIds: string[]): Promise<Map<string, ConsentState>> {
    if (householdIds.length === 0) return new Map()
    const rows = await prisma.$queryRaw<{ household_id: string; status: ConsentStatus; phone: string; source: ConsentSource; at: Date }[]>`
      SELECT DISTINCT ON (household_id) household_id, status, phone, source, at
      FROM platform.zalo_consents WHERE household_id = ANY(${householdIds}::text[])
      ORDER BY household_id, at DESC`
    return new Map(rows.map((r) => [r.household_id, { status: r.status, phone: r.phone, source: r.source, at: r.at }]))
  }

  async recordConsent(i: { htxCode: string; householdId: string; phone: string; status: ConsentStatus; source: ConsentSource; recordedBy: string }): Promise<void> {
    await this.write(`user:${i.recordedBy}`, (tx) => tx.$executeRaw`
      INSERT INTO platform.zalo_consents (household_id, htx_code, phone, status, source, recorded_by)
      VALUES (${i.householdId}, ${i.htxCode}, ${i.phone}, ${i.status}, ${i.source}, ${i.recordedBy})`)
  }

  async monthlyCount(htxCode: string, since: Date): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM platform.zalo_outbox WHERE htx_code = ${htxCode} AND status <> 'skipped' AND created_at >= ${since}`
    return rows[0]?.n ?? 0
  }

  async insertOutbox(rows: OutboxInsert[]): Promise<{ queued: number; skipped: number }> {
    if (rows.length === 0) return { queued: 0, skipped: 0 }
    return this.write('system:zalo', async (tx) => {
      let queued = 0
      let skipped = 0
      for (const r of rows) {
        const inserted = await tx.$executeRaw`
          INSERT INTO platform.zalo_outbox (htx_code, event_kind, event_id, household_id, phone, template_key, params, status, last_error, next_attempt_at)
          VALUES (${r.htxCode}, ${r.eventKind}, ${r.eventId}, ${r.householdId}, ${r.phone}, ${r.templateKey}, ${JSON.stringify(r.params)}::jsonb,
                  ${r.status}, ${r.lastError}, ${r.nextAttemptAt})
          ON CONFLICT (event_kind, event_id, phone) DO NOTHING`
        if (inserted && r.status === 'pending') queued++
        else if (inserted) skipped++
      }
      return { queued, skipped }
    })
  }

  async claimDue(limit: number, now: Date, leaseSeconds: number): Promise<OutboxRow[]> {
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000)
    const rows = await this.write('zalo:relay', (tx) => tx.$queryRaw<OutboxDbRow[]>`
      UPDATE platform.zalo_outbox
      SET status = 'leased', lease_until = ${leaseUntil}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM platform.zalo_outbox
        WHERE (status = 'pending' AND next_attempt_at <= ${now})
           OR (status = 'leased' AND lease_until <= ${now})
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${OUTBOX_COLUMNS}`)
    return rows.map(mapRow)
  }

  async outboxRow(id: string): Promise<OutboxRow | null> {
    const rows = await prisma.$queryRaw<OutboxDbRow[]>`SELECT ${OUTBOX_COLUMNS} FROM platform.zalo_outbox WHERE id = ${id}::uuid`
    return rows[0] ? mapRow(rows[0]) : null
  }

  async markSent(id: string, zaloMsgId: string | null): Promise<void> {
    await this.write('zalo:relay', (tx) => tx.$executeRaw`
      UPDATE platform.zalo_outbox SET status = 'sent', sent_at = now(), lease_until = NULL, last_error = NULL, zalo_msg_id = ${zaloMsgId}
      WHERE id = ${id}::uuid`)
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.write('zalo:relay', (tx) => tx.$executeRaw`
      UPDATE platform.zalo_outbox SET status = 'failed', lease_until = NULL, last_error = ${error} WHERE id = ${id}::uuid`)
  }

  async markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.write('zalo:relay', (tx) => tx.$executeRaw`
      UPDATE platform.zalo_outbox SET status = 'pending', lease_until = NULL, last_error = ${error}, next_attempt_at = ${nextAttemptAt}
      WHERE id = ${id}::uuid`)
  }

  async markSkipped(id: string, reason: SkipReason): Promise<void> {
    await this.write('zalo:relay', (tx) => tx.$executeRaw`
      UPDATE platform.zalo_outbox SET status = 'skipped', lease_until = NULL, last_error = ${reason} WHERE id = ${id}::uuid`)
  }

  async deliveries(htxCode: string, filter: DeliveryFilter): Promise<OutboxRow[]> {
    const rows = await prisma.$queryRaw<OutboxDbRow[]>`
      SELECT ${OUTBOX_COLUMNS} FROM platform.zalo_outbox
      WHERE htx_code = ${htxCode}
        AND (${filter.status ?? null}::text IS NULL OR status = ${filter.status ?? null})
        AND (${filter.kind ?? null}::text IS NULL OR event_kind = ${filter.kind ?? null})
      ORDER BY created_at DESC, id DESC LIMIT ${filter.limit}`
    return rows.map(mapRow)
  }

  async touchHeartbeat(version: string | null): Promise<void> {
    await this.write('service:zalo', (tx) => tx.$executeRaw`
      INSERT INTO platform.service_heartbeats (service, last_seen_at, version) VALUES ('zalo', now(), ${version})
      ON CONFLICT (service) DO UPDATE SET last_seen_at = now(), version = EXCLUDED.version`)
  }

  async credentials(): Promise<StoredCredentials | null> {
    const rows = await prisma.$queryRaw<{ access_token_enc: string; refresh_token_enc: string; expires_at: Date; updated_at: Date }[]>`
      SELECT access_token_enc, refresh_token_enc, expires_at, updated_at FROM platform.zalo_credentials WHERE id = 1`
    const r = rows[0]
    return r ? { accessTokenEnc: r.access_token_enc, refreshTokenEnc: r.refresh_token_enc, expiresAt: r.expires_at, updatedAt: r.updated_at } : null
  }

  async saveCredentials(i: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date }, actor: string): Promise<void> {
    await this.write(actor, (tx) => tx.$executeRaw`
      INSERT INTO platform.zalo_credentials (id, access_token_enc, refresh_token_enc, expires_at) VALUES (1, ${i.accessTokenEnc}, ${i.refreshTokenEnc}, ${i.expiresAt})
      ON CONFLICT (id) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc, refresh_token_enc = EXCLUDED.refresh_token_enc,
        expires_at = EXCLUDED.expires_at, updated_at = now()`)
  }
}
