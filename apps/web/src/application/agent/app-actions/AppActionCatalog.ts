// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Risk } from '@/domain/agent/proposal'
import type { ActionDefinition, ApproverRole } from '../action-catalog'
import type { AppActionCall } from './apps-actor-client'
import { buildPayloadSchema, fillPreview } from './app-action-schema'

export interface AgentActionManifest {
  name: string
  title_vi: string
  risk: Risk
  approver_roles: ApproverRole[]
  money?: boolean
  path: string
  payload: unknown
  preview_vi?: string
}

export interface AgentBlock {
  suggestions: string
  actions: AgentActionManifest[]
}

/** An installed app that declares an `agent` block, with the cooperatives it is enabled for (`*` for all). */
export interface AgentAppRecord {
  appId: string
  agent: AgentBlock
  htxCodes: string[]
}

export interface AppActionSource {
  listAgentApps(): Promise<AgentAppRecord[]>
  /** Moves the open proposals of apps that are no longer installed or enabled to `expired`; returns how many. */
  expireOrphaned(): Promise<number>
}

export type AppActionRunner = (call: AppActionCall) => Promise<Record<string, unknown>>

interface Entry {
  definition: ActionDefinition<any>
  htxCodes: ReadonlySet<string>
}

export const APP_KIND_PREFIX = 'app.'

function toDefinition(appId: string, action: AgentActionManifest, run: AppActionRunner): ActionDefinition<any> {
  const kind = `${APP_KIND_PREFIX}${appId}.${action.name}`
  const table = `app:${appId}`
  return {
    kind,
    titleVi: action.title_vi,
    risk: action.risk,
    approverRoles: action.approver_roles,
    origins: ['agent'],
    autonomy: action.money === true ? 'unlockable' : 'auto',
    money: action.money === true,
    channels: ['web', 'telegram'],
    payloadSchema: buildPayloadSchema(action.payload),
    editableFields: [],
    humanOnlyFields: [],
    subjectTable: null,
    repeatAfterHours: 24,
    expiresAfterHours: 72,
    preview(payload) {
      const labels = (payload._labels ?? {}) as Record<string, string>
      return [fillPreview(action.preview_vi ?? action.title_vi, payload, labels)]
    },
    // The dedupe subjects are the ids the app named in the evidence rows it sent with the suggestion.
    subjects(_payload, evidence) {
      return (evidence?.rows ?? []).filter((row) => row.table === table).map((row) => row.id)
    },
    // The app re-checks its own rules when the action runs.
    async isStale() {
      return false
    },
    async execute(payload, approver) {
      const { _labels, ...body } = payload as Record<string, unknown>
      return { result: await run({ appId, path: action.path, body, approver }) }
    },
  }
}

/** The catalogue entries of installed mini-apps (C3), kept for `ttlMs` and read synchronously by `getAction`. */
export class AppActionCatalog {
  private entries = new Map<string, Entry>()
  private loadedAt: number | null = null
  private loading: Promise<void> | null = null

  constructor(
    private readonly source: AppActionSource,
    private readonly run: AppActionRunner,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Cleared on install or remove; the next `ensure` reloads. */
  invalidate(): void {
    this.loadedAt = null
  }

  /** Loads when the entries are older than the TTL. A failed load keeps the old entries and is retried on the next call. */
  async ensure(): Promise<void> {
    if (this.loadedAt !== null && this.now() - this.loadedAt < this.ttlMs) return
    this.loading ??= this.load().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async load(): Promise<void> {
    try {
      // Expire first so a proposal of a removed app never outlives the load that notices the removal.
      await this.source.expireOrphaned().catch((err) => console.error('[AppActionCatalog] could not expire orphaned proposals', err))
      const next = new Map<string, Entry>()
      for (const app of await this.source.listAgentApps()) {
        for (const action of app.agent.actions ?? []) {
          try {
            const definition = toDefinition(app.appId, action, this.run)
            next.set(definition.kind, { definition, htxCodes: new Set(app.htxCodes) })
          } catch (err) {
            console.error(`[AppActionCatalog] skipped ${app.appId} action ${action?.name}:`, err instanceof Error ? err.message : err)
          }
        }
      }
      this.entries = next
      this.loadedAt = this.now()
    } catch (err) {
      console.error('[AppActionCatalog] could not load the app actions; keeping the previous ones', err)
    }
  }

  /** With a cooperative, only an app enabled for it resolves; without one (display only), any installed app does. */
  find(kind: string, htxCode?: string): ActionDefinition<any> | undefined {
    if (!kind.startsWith(APP_KIND_PREFIX)) return undefined
    const entry = this.entries.get(kind)
    if (!entry) return undefined
    if (htxCode !== undefined && !entry.htxCodes.has('*') && !entry.htxCodes.has(htxCode)) return undefined
    return entry.definition
  }
}
