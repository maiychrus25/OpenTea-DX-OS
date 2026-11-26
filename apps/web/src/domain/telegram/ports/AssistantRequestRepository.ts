// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type AssistantRole = 'farmer' | 'officer' | 'manager'

export type AssistantRequestStatus = 'pending' | 'claimed' | 'done' | 'failed' | 'expired'

export interface AssistantRequestRow {
  id: string
  htxCode: string
  telegramUserId: string
  chatId: string
  userId: string
  role: AssistantRole
  text: string
  status: AssistantRequestStatus
  createdAt: Date
  runId: string | null
}

export interface NewAssistantRequest {
  htxCode: string
  telegramUserId: string
  chatId: string
  userId: string
  role: AssistantRole
  text: string
}

/** A request that timed out: the lease route answers its chat with the timeout reply and the menu. */
export interface ExpiredAssistantRequest {
  htxCode: string
  chatId: string
  role: AssistantRole
}

export interface AssistantRequestRepository {
  create(request: NewAssistantRequest): Promise<string>
  /** Claims up to `limit` oldest pending requests of the cooperative; they become `claimed`. */
  claim(htxCode: string, limit: number, now: Date): Promise<AssistantRequestRow[]>
  find(id: string): Promise<AssistantRequestRow | null>
  /** Moves a claimed request of this cooperative to `done` or `failed`, blanks its text; false when it was not claimed. */
  finish(id: string, htxCode: string, status: 'done' | 'failed', runId: string | null): Promise<boolean>
  /** Pending or claimed requests created before the cutoff become `expired`, and their text is blanked. */
  expireOlderThan(cutoff: Date): Promise<ExpiredAssistantRequest[]>
}
