// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { normalizePhone } from '@/domain/zalo/phone'
import { deliveryTime } from '@/domain/zalo/quiet-hours'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import type { OutboxInsert, ZaloRepository, ZaloSettings, ZaloTemplate } from '@/domain/zalo/ports/ZaloRepository'
import { TEMPLATE_PARAM_KEYS, templateKeyOf, type SkipReason, type ZaloEvent } from '@/domain/zalo/zalo-events'

export const MAX_SEND_ATTEMPTS = 10
const MAX_BACKOFF_SECONDS = 15 * 60

export type OutboxResult =
  | { ok: true; zalo_msg_id?: string | null }
  | { ok: false; error: string; permanent?: boolean; retry_after_seconds?: number }

export interface LeasedMessage {
  id: string
  phone: string
  zns_template_id: string
  template_data: Record<string, string>
  tracking_id: string
}

/** Writes the outbox of the platform Zalo channel and hands it to the relay. The relay only transports. */
export class ZaloNotifier {
  constructor(private readonly repo: ZaloRepository, private readonly now: () => Date = () => new Date()) {}

  /** Queues one row per recipient. A row that must not be sent is written as `skipped` with the reason. */
  async enqueue(input: ZaloEvent | ZaloEvent[]): Promise<{ queued: number; skipped: number }> {
    const events = Array.isArray(input) ? input : [input]
    if (events.length === 0) return { queued: 0, skipped: 0 }
    const now = this.now()
    const settingsOf = this.settingsCache()
    const templates = new Map((await this.repo.templates()).map((t) => [t.templateKey, t]))
    const monthStart = vnDayStart(`${vnDayOf(now).slice(0, 7)}-01`)
    const used = new Map<string, number>()
    const rows: OutboxInsert[] = []

    for (const event of events) {
      const settings = await settingsOf(event.htxCode)
      // A cooperative with Zalo off writes nothing: its outbox stays empty instead of filling with skipped rows.
      if (!settings.enabled) continue
      const template = templates.get(templateKeyOf(event.kind))
      const recipients = await this.repo.recipients(event.htxCode, event.householdId)
      const consents = await this.repo.latestConsents(recipients.map((r) => r.id))
      if (!used.has(event.htxCode)) used.set(event.htxCode, await this.repo.monthlyCount(event.htxCode, monthStart))

      for (const recipient of recipients) {
        const phone = normalizePhone(recipient.phone)
        const consent = consents.get(recipient.id)
        const values = { ...event.params, customer_name: recipient.name }
        const params = template ? pickParams(template, event.kind, values) : null
        let reason: SkipReason | null =
          !settings.enabled ? 'ZALO_OFF'
          : !settings.kinds.includes(event.kind) ? 'KIND_OFF'
          : !phone ? 'INVALID_PHONE'
          : !template ? 'NO_TEMPLATE'
          : !params ? 'BAD_TEMPLATE'
          : !consent || (consent.status === 'OPTED_IN' && consent.phone !== phone) ? 'NO_CONSENT'
          : consent.status !== 'OPTED_IN' ? 'CONSENT_REVOKED'
          : null
        // shortcut: the quota is read once per call, so two events racing can pass it by a few messages; the relay quota of Zalo is the hard stop.
        if (!reason && (used.get(event.htxCode) ?? 0) >= settings.monthlyQuota) reason = 'QUOTA_REACHED'
        if (!reason) used.set(event.htxCode, (used.get(event.htxCode) ?? 0) + 1)
        rows.push({
          htxCode: event.htxCode,
          eventKind: event.kind,
          eventId: event.eventId,
          householdId: recipient.id,
          phone: phone ?? recipient.phone.trim(),
          templateKey: templateKeyOf(event.kind),
          params: params ?? {},
          status: reason ? 'skipped' : 'pending',
          lastError: reason,
          nextAttemptAt: deliveryTime(now, event.kind, { quietStartHour: settings.quietStartHour, quietEndHour: settings.quietEndHour }),
        })
      }
    }
    return this.repo.insertOutbox(rows)
  }

  /** Leases due rows for the relay. Consent, settings and the template are read again here, so an opt-out after queuing wins. */
  async lease(limit: number, leaseSeconds = 60): Promise<LeasedMessage[]> {
    const claimed = await this.repo.claimDue(limit, this.now(), leaseSeconds)
    const settingsOf = this.settingsCache()
    const templates = new Map((await this.repo.templates()).map((t) => [t.templateKey, t]))
    const consents = await this.repo.latestConsents(Array.from(new Set(claimed.map((r) => r.householdId))))
    const out: LeasedMessage[] = []

    for (const row of claimed) {
      if (row.attempts > MAX_SEND_ATTEMPTS) {
        await this.repo.markFailed(row.id, 'MAX_ATTEMPTS')
        continue
      }
      const settings = await settingsOf(row.htxCode)
      const template = templates.get(row.templateKey)
      const consent = consents.get(row.householdId)
      const reason: SkipReason | null =
        !settings.enabled ? 'ZALO_OFF'
        : !settings.kinds.includes(row.eventKind) ? 'KIND_OFF'
        : !template ? 'NO_TEMPLATE'
        : consent?.status !== 'OPTED_IN' || consent.phone !== row.phone ? 'CONSENT_REVOKED'
        : null
      if (reason || !template) {
        await this.repo.markSkipped(row.id, reason ?? 'NO_TEMPLATE')
        continue
      }
      out.push({ id: row.id, phone: row.phone, zns_template_id: template.znsTemplateId, template_data: row.params, tracking_id: row.id })
    }
    return out
  }

  /** Records the relay's answer. Null when the row does not exist; a row no longer leased keeps its status. */
  async recordResult(id: string, result: OutboxResult): Promise<'sent' | 'pending' | 'failed' | null> {
    const row = await this.repo.outboxRow(id)
    if (!row) return null
    if (row.status !== 'leased') return row.status === 'sent' || row.status === 'pending' ? row.status : 'failed'

    if (result.ok) {
      await this.repo.markSent(id, result.zalo_msg_id ?? null)
      return 'sent'
    }
    if (result.permanent || row.attempts >= MAX_SEND_ATTEMPTS) {
      await this.repo.markFailed(id, result.error.slice(0, 1000))
      return 'failed'
    }
    const now = this.now()
    const settings = await this.repo.settings(row.htxCode)
    const backoff = result.retry_after_seconds ?? Math.min(5 * 2 ** Math.max(row.attempts - 1, 0), MAX_BACKOFF_SECONDS)
    const next = deliveryTime(new Date(now.getTime() + backoff * 1000), row.eventKind, { quietStartHour: settings.quietStartHour, quietEndHour: settings.quietEndHour })
    await this.repo.markRetry(id, result.error.slice(0, 1000), next)
    return 'pending'
  }

  private settingsCache() {
    const cache = new Map<string, Promise<ZaloSettings>>()
    return (htxCode: string) => {
      if (!cache.has(htxCode)) cache.set(htxCode, this.repo.settings(htxCode))
      return cache.get(htxCode)!
    }
  }
}

function pickParams(template: ZaloTemplate, kind: ZaloEvent['kind'], values: Record<string, string>): Record<string, string> | null {
  const allowed = TEMPLATE_PARAM_KEYS[templateKeyOf(kind)]
  const picked: Record<string, string> = {}
  for (const name of template.params) {
    if (!allowed.includes(name) || values[name] === undefined) return null
    picked[name] = values[name]
  }
  return picked
}
