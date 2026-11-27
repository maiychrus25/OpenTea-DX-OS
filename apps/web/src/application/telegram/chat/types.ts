// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Shared shapes of the Telegram assistant (M5 plan, contracts C5-C7): the engine runs tools and actions it only knows
// through these types, and the tools and actions never see Telegram.
import type { z } from 'zod'
import type { Risk } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'

export type ChatRole = Tenant['role']

/** The linked person for one update: role, cooperative and enabled flag read live from Keycloak, never from the link. */
export interface ChatUser {
  tenant: Tenant
  userName: string
  /** The farmer's household; null for officers and managers. */
  householdId: string | null
  telegramUserId: string
  chatId: number
}

/** A read answer. The engine appends `Nguồn: <source>`, so `lines` holds at most 7 lines. */
export interface ChatReply {
  lines: string[]
  source: string
  /** Open proposals the engine then sends to this chat with their approve and reject buttons (tool `pending`). */
  proposalIds?: string[]
}

/** What A7 may fill in for a tool or an action; `name` equals the step slot for actions. */
export interface ArgHint {
  name: string
  type: 'string' | 'integer' | 'number' | 'enum'
  values?: readonly string[]
  descriptionVi: string
}

export const TOOL_NAMES = [
  'today',
  'pending',
  'weather',
  'market',
  'bulletin',
  'notifications',
  'journal',
  'harvest_schedule',
  'parcels',
  'lots',
  'nearby',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export interface ChatTool {
  name: ToolName
  titleVi: string
  roles: readonly ChatRole[]
  /** `METHOD /api/...` rows of the chat-read group of the coverage table that this tool answers from. */
  routes: readonly string[]
  args: readonly ArgHint[]
  run(user: ChatUser, args: Record<string, unknown>, now: Date): Promise<ChatReply>
}

export const ACTION_NAMES = ['journal.create', 'disease.report', 'journal.batch_approve', 'harvest.approve'] as const
export type ActionName = (typeof ACTION_NAMES)[number]

export interface Choice {
  value: string
  label: string
}

type FlowState = Record<string, unknown>

interface StepBase {
  slot: string
  promptVi: string
  /** Skip this step when it returns false for the answers so far. */
  when?(state: FlowState): boolean
}

/** Up to 8 choices are buttons; more become a typed answer matched against the labels, ignoring case and marks. */
export interface ChoiceStep extends StepBase {
  kind: 'choice'
  choices(user: ChatUser, state: FlowState): Promise<Choice[]>
}

export interface TextStep extends StepBase {
  kind: 'text'
  maxLength: number
}

export interface IntegerStep extends StepBase {
  kind: 'integer'
  min: number
  max: number
}

/** The engine stores the photo at `photoKey(user)` and puts that key in the slot. */
export interface PhotoStep extends StepBase {
  kind: 'photo'
  optional: boolean
  photoKey(user: ChatUser): string
}

export type FlowStep = ChoiceStep | TextStep | IntegerStep | PhotoStep

export interface PhotoStore {
  put(key: string, bytes: Buffer, mimeType: 'image/jpeg' | 'image/png'): Promise<void>
  get(key: string): Promise<Buffer>
  /** Removes a stored photo; used for photos whose card was cancelled or whose flow was dropped. */
  delete(key: string): Promise<void>
}

export interface ChatActionDeps {
  photos: PhotoStore
}

export interface ChatAction<P extends Record<string, unknown> = Record<string, unknown>> {
  name: ActionName
  titleVi: string
  risk: Risk
  roles: readonly ChatRole[]
  /** `METHOD /api/...` rows of the chat-confirm group that this action performs. */
  routes: readonly string[]
  args: readonly ArgHint[]
  /** Runs before the first step: initial state, or a reply that ends the flow (for example nothing to approve). */
  start?(user: ChatUser, now: Date): Promise<{ state: FlowState } | { replyVi: string }>
  steps: readonly FlowStep[]
  /** The complete payload the card shows; built from the flow state once every step is answered. */
  payloadSchema: z.ZodType<P, z.ZodTypeDef, unknown>
  /** Text of the second card; required when `risk` is 'high', null otherwise. */
  consequenceVi: string | null
  preview(payload: P, user: ChatUser): Promise<string[]>
  /** The same use case as the route, as the user. Returns the line that replaces the card text. */
  execute(payload: P, user: ChatUser, deps: ChatActionDeps, now: Date): Promise<string>
}

/** What A7 returns for a sentence (C7). The web validates names and arguments before acting on it. */
export type Intent =
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'action'; name: string; args: Record<string, unknown> }
  | { type: 'unknown' }
