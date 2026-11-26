// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  AutopilotConfig,
  AutopilotDayCounts,
  AutopilotDaySummary,
  KindMatchRate,
  StopReason,
} from '@/domain/agent/autopilot'
import { disabledConfig } from '@/domain/agent/autopilot'
import type {
  AutopilotRepository,
  BlockOutcome,
  DueProposal,
  EnableAutopilotRecord,
} from '@/domain/agent/ports/AutopilotRepository'
import { prisma } from '@/infrastructure/db/prisma.client'

type ConfigRow = {
  htx_code: string
  enabled: boolean
  enabled_by: string | null
  enabled_by_name: string | null
  enabled_at: Date | null
  unlocked_kinds: string[]
  daily_cap: number
  stopped_at: Date | null
  stopped_by: string | null
  stop_reason: StopReason | null
  last_manager_activity_at: Date | null
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function mapConfig(r: ConfigRow): AutopilotConfig {
  return {
    htxCode: r.htx_code,
    enabled: r.enabled,
    enabledBy: r.enabled_by,
    enabledByName: r.enabled_by_name,
    enabledAt: r.enabled_at,
    unlockedKinds: r.unlocked_kinds,
    dailyCap: r.daily_cap,
    stoppedAt: r.stopped_at,
    stoppedBy: r.stopped_by,
    stopReason: r.stop_reason,
    lastManagerActivityAt: r.last_manager_activity_at,
  }
}

/** Persistence adapter for `platform.autopilot` and the window columns of `platform.agent_proposals` (raw SQL, audited). */
export class PrismaAutopilotRepository implements AutopilotRepository {
  async get(htxCode: string): Promise<AutopilotConfig> {
    const rows = await prisma.$queryRaw<ConfigRow[]>`
      SELECT htx_code, enabled, enabled_by, enabled_by_name, enabled_at, unlocked_kinds, daily_cap,
             stopped_at, stopped_by, stop_reason, last_manager_activity_at
      FROM platform.autopilot
      WHERE htx_code = ${htxCode}
      LIMIT 1
    `
    return rows[0] ? mapConfig(rows[0]) : disabledConfig(htxCode)
  }

  async enable(htxCode: string, record: EnableAutopilotRecord): Promise<void> {
    const actor = `user:${record.userId}`
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      await tx.$executeRaw`
        INSERT INTO platform.autopilot (
          htx_code, enabled, enabled_by, enabled_by_name, enabled_at, unlocked_kinds, daily_cap,
          stopped_at, stopped_by, stop_reason, last_manager_activity_at, updated_at
        )
        VALUES (
          ${htxCode}, true, ${record.userId}, ${record.userName}, now(), ${record.unlockedKinds}::text[], ${record.dailyCap},
          NULL, NULL, NULL, now(), now()
        )
        ON CONFLICT (htx_code) DO UPDATE SET
          enabled = true, enabled_by = EXCLUDED.enabled_by, enabled_by_name = EXCLUDED.enabled_by_name,
          enabled_at = now(), unlocked_kinds = EXCLUDED.unlocked_kinds, daily_cap = EXCLUDED.daily_cap,
          stopped_at = NULL, stopped_by = NULL, stop_reason = NULL, last_manager_activity_at = now(), updated_at = now()
      `
      const details = {
        actor,
        htx_code: htxCode,
        unlocked_kinds: record.unlockedKinds,
        daily_cap: record.dailyCap,
        screen: record.snapshot,
      }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'autopilot.enabled', ${htxCode}, ${JSON.stringify(details)}::jsonb)
      `
    })
  }

  async stop(htxCode: string, reason: StopReason, by: string | null): Promise<{ returned: number } | null> {
    const actor = by ? `user:${by}` : 'system:autopilot'
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const stopped = await tx.$executeRaw`
        UPDATE platform.autopilot
        SET enabled = false, stopped_at = now(), stopped_by = ${by}, stop_reason = ${reason}, updated_at = now()
        WHERE htx_code = ${htxCode} AND enabled
      `
      if (stopped === 0) return null
      const returned = await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET run_at = NULL, run_claimed_at = NULL
        WHERE htx_code = ${htxCode} AND status = 'proposed' AND (run_at IS NOT NULL OR run_claimed_at IS NOT NULL)
      `
      const details = { actor, htx_code: htxCode, reason, returned }
      await tx.$executeRaw`
        SELECT audit.record_event('web', 'autopilot.stopped', ${htxCode}, ${JSON.stringify(details)}::jsonb)
      `
      return { returned }
    })
  }

  async touchManagerActivity(htxCode: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - MINUTE_MS)
    await prisma.$executeRaw`
      UPDATE platform.autopilot
      SET last_manager_activity_at = ${now}
      WHERE htx_code = ${htxCode} AND enabled
        AND (last_manager_activity_at IS NULL OR last_manager_activity_at < ${cutoff})
    `
  }

  async claimDue(htxCode: string, limit: number): Promise<DueProposal[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', 'system:autopilot', true)`
      return tx.$queryRaw<DueProposal[]>`
        UPDATE platform.agent_proposals p
        SET run_claimed_at = now()
        WHERE p.id IN (
          SELECT id FROM platform.agent_proposals
          WHERE htx_code = ${htxCode} AND status = 'proposed' AND run_at IS NOT NULL AND run_at <= now()
            AND run_claimed_at IS NULL
          ORDER BY run_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
          AND p.run_claimed_at IS NULL
        RETURNING p.id::text AS id, p.agent, p.kind
      `
    })
  }

  async clearWindow(htxCode: string, proposalId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', 'system:autopilot', true)`
      await tx.$executeRaw`
        UPDATE platform.agent_proposals
        SET run_at = NULL, run_claimed_at = NULL
        WHERE id = ${proposalId}::uuid AND htx_code = ${htxCode} AND status = 'proposed'
      `
    })
  }

  async block(htxCode: string, proposalId: string, userId: string): Promise<BlockOutcome> {
    const actor = `user:${userId}`
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const blocked = await tx.$queryRaw<{ kind: string }[]>`
        UPDATE platform.agent_proposals
        SET blocked_by = ${userId}, blocked_at = now(), run_at = NULL
        WHERE id = ${proposalId}::uuid AND htx_code = ${htxCode} AND status = 'proposed'
          AND run_at IS NOT NULL AND run_claimed_at IS NULL
        RETURNING kind
      `
      if (blocked.length > 0) {
        const details = { actor, htx_code: htxCode, kind: blocked[0].kind }
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'autopilot.blocked', ${proposalId}, ${JSON.stringify(details)}::jsonb)
        `
        return 'blocked'
      }
      const rows = await tx.$queryRaw<{ status: string; run_claimed_at: Date | null }[]>`
        SELECT status, run_claimed_at FROM platform.agent_proposals
        WHERE id = ${proposalId}::uuid AND htx_code = ${htxCode}
      `
      if (rows.length === 0) return 'not_found'
      if (rows[0].status !== 'proposed' || rows[0].run_claimed_at) return 'already_ran'
      return 'not_scheduled'
    })
  }

  async dayCounts(htxCode: string, dayStart: Date, now: Date): Promise<AutopilotDayCounts> {
    const hourAgo = new Date(now.getTime() - HOUR_MS)
    const rows = await prisma.$queryRaw<{ auto_runs: number; blocked: number; failures: number }[]>`
      SELECT
        count(*) FILTER (WHERE decision_channel = 'autopilot' AND decided_at >= ${dayStart})::int AS auto_runs,
        count(*) FILTER (WHERE blocked_at >= ${dayStart})::int AS blocked,
        count(*) FILTER (WHERE run_claimed_at >= ${hourAgo} AND status IN ('failed', 'stale'))::int AS failures
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode}
    `
    const row = rows[0]
    return { autoRuns: row?.auto_runs ?? 0, blocked: row?.blocked ?? 0, failuresLastHour: row?.failures ?? 0 }
  }

  async countPending(htxCode: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND status = 'proposed' AND run_at IS NOT NULL
    `
    return rows[0]?.n ?? 0
  }

  async volumeSpike(htxCode: string, dayStart: Date): Promise<string | null> {
    const historyStart = new Date(dayStart.getTime() - 14 * DAY_MS)
    const rows = await prisma.$queryRaw<{ agent: string }[]>`
      WITH today AS (
        SELECT agent, count(*) AS n FROM platform.agent_proposals
        WHERE htx_code = ${htxCode} AND origin = 'agent' AND created_at >= ${dayStart}
        GROUP BY agent
      ), history AS (
        SELECT agent, count(*)::numeric / 14 AS daily FROM platform.agent_proposals
        WHERE htx_code = ${htxCode} AND origin = 'agent' AND created_at >= ${historyStart} AND created_at < ${dayStart}
        GROUP BY agent
      )
      SELECT t.agent FROM today t JOIN history h ON h.agent = t.agent
      WHERE h.daily >= 1 AND t.n > 3 * h.daily
      ORDER BY t.agent
      LIMIT 1
    `
    return rows[0]?.agent ?? null
  }

  async matchRates(htxCode: string, since: Date): Promise<KindMatchRate[]> {
    // A person's decision only: an auto-run would confirm its own shadow value.
    const rows = await prisma.$queryRaw<{ kind: string; sample: number; matched: number }[]>`
      SELECT kind,
             count(*)::int AS sample,
             count(*) FILTER (WHERE shadow_auto = (status IN ('approved', 'executed', 'failed')))::int AS matched
      FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND origin = 'agent' AND shadow_auto IS NOT NULL
        AND status IN ('approved', 'executed', 'failed', 'rejected')
        AND decision_channel IS DISTINCT FROM 'autopilot'
        AND decided_at >= ${since}
      GROUP BY kind
      ORDER BY kind
    `
    return rows
  }

  async householdMessageCounts(htxCode: string, htxProfileId: string, dayStart: Date): Promise<Map<string, number>> {
    const rows = await prisma.$queryRaw<{ payload: { slots?: { parcel_codes?: string[] } } }[]>`
      SELECT payload FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND kind = 'notification.households' AND decision_channel = 'autopilot'
        AND status IN ('approved', 'executed') AND decided_at >= ${dayStart}
    `
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const household of await this.householdsOfParcels(htxProfileId, row.payload?.slots?.parcel_codes ?? [])) {
        counts.set(household, (counts.get(household) ?? 0) + 1)
      }
    }
    return counts
  }

  async householdsOfParcels(htxProfileId: string, parcelCodes: string[]): Promise<string[]> {
    if (parcelCodes.length === 0) return []
    const parcels = await prisma.parcel.findMany({
      where: { parcel_code: { in: parcelCodes }, household: { htx_profile_id: htxProfileId } },
      select: { household: { select: { id: true } } },
    })
    return Array.from(new Set(parcels.map((p) => p.household.id)))
  }

  async daySummary(htxCode: string, dayStart: Date, dayEnd: Date): Promise<AutopilotDaySummary> {
    const rows = await prisma.$queryRaw<
      { ran: number; blocked: number; brakes: number; events: number; enabled: boolean; cost: string | null }[]
    >`
      SELECT
        (SELECT count(*)::int FROM platform.agent_proposals
          WHERE htx_code = ${htxCode} AND decision_channel = 'autopilot' AND decided_at >= ${dayStart} AND decided_at < ${dayEnd}) AS ran,
        (SELECT count(*)::int FROM platform.agent_proposals
          WHERE htx_code = ${htxCode} AND blocked_at >= ${dayStart} AND blocked_at < ${dayEnd}) AS blocked,
        (SELECT count(*)::int FROM audit.events
          WHERE op = 'autopilot.stopped' AND row_id = ${htxCode} AND occurred_at >= ${dayStart} AND occurred_at < ${dayEnd}
            AND new_data->>'reason' LIKE 'brake\_%') AS brakes,
        (SELECT count(*)::int FROM audit.events
          WHERE op IN ('autopilot.enabled', 'autopilot.stopped') AND row_id = ${htxCode}
            AND occurred_at >= ${dayStart} AND occurred_at < ${dayEnd}) AS events,
        coalesce((SELECT enabled FROM platform.autopilot WHERE htx_code = ${htxCode}), false) AS enabled,
        (SELECT sum(cost_estimate)::text FROM platform.agent_runs
          WHERE htx_code = ${htxCode} AND started_at >= ${dayStart} AND started_at < ${dayEnd}) AS cost
    `
    const row = rows[0]
    return {
      wasOn: Boolean(row?.enabled) || (row?.events ?? 0) > 0,
      ran: row?.ran ?? 0,
      blocked: row?.blocked ?? 0,
      brakes: row?.brakes ?? 0,
      costUsd: Number(row?.cost ?? 0),
    }
  }
}
