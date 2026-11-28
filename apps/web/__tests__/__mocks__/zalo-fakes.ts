// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  ConsentState, DeliveryFilter, OutboxInsert, OutboxRow, StoredCredentials, ZaloRecipient, ZaloRepository, ZaloSettings, ZaloTemplate,
} from '@/domain/zalo/ports/ZaloRepository'
import type { SkipReason } from '@/domain/zalo/zalo-events'

export const ALL_KINDS = ['PRICE_PUBLISHED', 'TICKET_RECEIPT', 'WITHDRAWAL_ENDED', 'SETTLEMENT_CLOSED'] as const
export const ON: ZaloSettings = { enabled: true, kinds: [...ALL_KINDS], quietStartHour: 21, quietEndHour: 6, monthlyQuota: 2000 }

/** In-memory ZaloRepository with the same rules as the SQL: the unique event key, the newest consent wins. */
export class FakeZaloRepository implements ZaloRepository {
  settingsByHtx = new Map<string, ZaloSettings>()
  templateList: ZaloTemplate[] = []
  households: (ZaloRecipient & { htxCode: string })[] = []
  consents: { householdId: string; state: ConsentState; recordedBy: string }[] = []
  rows: OutboxRow[] = []
  monthly = new Map<string, number>()
  stored: StoredCredentials | null = null
  heartbeats = 0
  private n = 0

  async settings(htx: string) { return this.settingsByHtx.get(htx) ?? { ...ON, enabled: false } }
  async saveSettings(htx: string, s: ZaloSettings) { this.settingsByHtx.set(htx, s) }
  async templates() { return this.templateList }
  async saveTemplates(t: ZaloTemplate[]) { this.templateList = t }
  async recipients(htx: string, id: string | null) {
    return this.households.filter((h) => h.htxCode === htx && (id === null || h.id === id)).map(({ id: hid, name, phone }) => ({ id: hid, name, phone }))
  }
  async latestConsents(ids: string[]) {
    const out = new Map<string, ConsentState>()
    for (const c of this.consents) if (ids.includes(c.householdId)) out.set(c.householdId, c.state)
    return out
  }
  async recordConsent(i: { householdId: string; phone: string; status: ConsentState['status']; source: ConsentState['source']; recordedBy: string }) {
    this.consents.push({ householdId: i.householdId, recordedBy: i.recordedBy, state: { status: i.status, phone: i.phone, source: i.source, at: new Date() } })
  }
  async monthlyCount(htx: string) {
    return (this.monthly.get(htx) ?? 0) + this.rows.filter((r) => r.htxCode === htx && r.status !== 'skipped').length
  }
  async insertOutbox(rows: OutboxInsert[]) {
    let queued = 0
    let skipped = 0
    for (const r of rows) {
      if (this.rows.some((x) => x.eventKind === r.eventKind && x.eventId === r.eventId && x.phone === r.phone)) continue
      this.rows.push({ id: `row-${++this.n}`, htxCode: r.htxCode, eventKind: r.eventKind, eventId: r.eventId, householdId: r.householdId, phone: r.phone, templateKey: r.templateKey, params: r.params, status: r.status, attempts: 0, nextAttemptAt: r.nextAttemptAt, lastError: r.lastError, createdAt: new Date(), sentAt: null })
      if (r.status === 'pending') queued++
      else skipped++
    }
    return { queued, skipped }
  }
  async claimDue(limit: number, now: Date) {
    const due = this.rows.filter((r) => r.status === 'pending' && r.nextAttemptAt <= now).slice(0, limit)
    for (const r of due) { r.status = 'leased'; r.attempts += 1 }
    return due
  }
  async outboxRow(id: string) { return this.rows.find((r) => r.id === id) ?? null }
  private find(id: string) { return this.rows.find((r) => r.id === id)! }
  async markSent(id: string) { Object.assign(this.find(id), { status: 'sent', sentAt: new Date(), lastError: null }) }
  async markFailed(id: string, error: string) { Object.assign(this.find(id), { status: 'failed', lastError: error }) }
  async markRetry(id: string, error: string, next: Date) { Object.assign(this.find(id), { status: 'pending', lastError: error, nextAttemptAt: next }) }
  async markSkipped(id: string, reason: SkipReason) { Object.assign(this.find(id), { status: 'skipped', lastError: reason }) }
  async deliveries(htx: string, f: DeliveryFilter) {
    return this.rows.filter((r) => r.htxCode === htx && (!f.status || r.status === f.status) && (!f.kind || r.eventKind === f.kind)).slice(0, f.limit)
  }
  async touchHeartbeat() { this.heartbeats++ }
  async credentials() { return this.stored }
  async saveCredentials(i: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date }) { this.stored = { ...i, updatedAt: new Date() } }
}

export function seedHousehold(repo: FakeZaloRepository, id = 'hh-1', phone = '0912345678', htxCode = 'TC', optedIn = true) {
  repo.households.push({ id, name: `Hộ ${id}`, phone, htxCode })
  if (optedIn) repo.consents.push({ householdId: id, recordedBy: 'officer-1', state: { status: 'OPTED_IN', phone: `84${phone.slice(1)}`, source: 'OFFICER', at: new Date() } })
}

export const TEMPLATES: ZaloTemplate[] = [
  { templateKey: 'price_today', znsTemplateId: '111', params: ['customer_name', 'date', 'price_list'] },
  { templateKey: 'ticket_receipt', znsTemplateId: '222', params: ['ticket_no', 'date', 'net_kg', 'amount_vnd'] },
  { templateKey: 'withdrawal_ended', znsTemplateId: '333', params: ['parcel_code', 'safe_date'] },
  { templateKey: 'settlement_closed', znsTemplateId: '444', params: ['period_code', 'result_label', 'amount_vnd', 'slip_url'] },
]
