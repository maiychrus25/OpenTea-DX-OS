// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SkipReason, TemplateKey, ZaloEventKind } from '../zalo-events'

export interface ZaloSettings {
  enabled: boolean
  kinds: ZaloEventKind[]
  quietStartHour: number
  quietEndHour: number
  monthlyQuota: number
}

export interface ZaloTemplate {
  templateKey: TemplateKey
  znsTemplateId: string
  params: string[]
}

export interface ZaloRecipient {
  id: string
  name: string
  phone: string
}

export type ConsentStatus = 'OPTED_IN' | 'OPTED_OUT'
export type ConsentSource = 'REGISTRATION' | 'OFFICER' | 'MEMBER'

export interface ConsentState {
  status: ConsentStatus
  phone: string
  source: ConsentSource
  at: Date
}

export type OutboxStatus = 'pending' | 'leased' | 'sent' | 'failed' | 'skipped'

export interface OutboxInsert {
  htxCode: string
  eventKind: ZaloEventKind
  eventId: string
  householdId: string
  phone: string
  templateKey: TemplateKey
  params: Record<string, string>
  status: 'pending' | 'skipped'
  lastError: SkipReason | null
  nextAttemptAt: Date
}

export interface OutboxRow {
  id: string
  htxCode: string
  eventKind: ZaloEventKind
  eventId: string
  householdId: string
  phone: string
  templateKey: TemplateKey
  params: Record<string, string>
  status: OutboxStatus
  attempts: number
  nextAttemptAt: Date
  lastError: string | null
  createdAt: Date
  sentAt: Date | null
}

export interface DeliveryFilter {
  status?: OutboxStatus
  kind?: ZaloEventKind
  limit: number
}

export interface StoredCredentials {
  accessTokenEnc: string
  refreshTokenEnc: string
  expiresAt: Date
  updatedAt: Date
}

/** Persistence of the `platform.zalo_*` tables. */
export interface ZaloRepository {
  settings(htxCode: string): Promise<ZaloSettings>
  saveSettings(htxCode: string, settings: ZaloSettings, actor: string): Promise<void>
  templates(): Promise<ZaloTemplate[]>
  saveTemplates(templates: ZaloTemplate[], actor: string): Promise<void>
  /** Households of the cooperative with a phone; `householdId` null means all of them. Never another cooperative's. */
  recipients(htxCode: string, householdId: string | null): Promise<ZaloRecipient[]>
  /** One household of the cooperative, or null when it is not there or belongs to another cooperative. */
  household(htxCode: string, householdId: string): Promise<{ id: string; phone: string; keycloakUserId: string | null } | null>
  latestConsents(householdIds: string[]): Promise<Map<string, ConsentState>>
  recordConsent(input: { htxCode: string; householdId: string; phone: string; status: ConsentStatus; source: ConsentSource; recordedBy: string }): Promise<void>
  /** Rows of the cooperative since `since` that count against the quota: everything except skipped. */
  monthlyCount(htxCode: string, since: Date): Promise<number>
  /** Inserts rows; a (kind, event, phone) that exists is left alone. Counts only the rows newly written. */
  insertOutbox(rows: OutboxInsert[]): Promise<{ queued: number; skipped: number }>
  /** Marks due rows (and rows whose lease ended) leased and returns them, each with `attempts` already counted. */
  claimDue(limit: number, now: Date, leaseSeconds: number): Promise<OutboxRow[]>
  outboxRow(id: string): Promise<OutboxRow | null>
  markSent(id: string, zaloMsgId: string | null): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void>
  markSkipped(id: string, reason: SkipReason): Promise<void>
  deliveries(htxCode: string, filter: DeliveryFilter): Promise<OutboxRow[]>
  touchHeartbeat(version: string | null): Promise<void>
  credentials(): Promise<StoredCredentials | null>
  saveCredentials(input: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date }, actor: string): Promise<void>
}
