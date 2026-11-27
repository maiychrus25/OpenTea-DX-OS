// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentAppRecord, AppActionSource } from '@/application/agent/app-actions/AppActionCatalog'
import { prisma } from '@/infrastructure/db/prisma.client'

/** Reads the `agent` block of installed manifests and expires the open proposals of apps that are gone or disabled. */
export class PrismaAppActionRepository implements AppActionSource {
  async listAgentApps(): Promise<AgentAppRecord[]> {
    const rows = await prisma.$queryRaw<{ app_id: string; agent: AgentAppRecord['agent']; htx_codes: string[] }[]>`
      SELECT a.id AS app_id, a.manifest -> 'agent' AS agent, array_agg(e.htx_code) AS htx_codes
      FROM platform.installed_apps a
      JOIN platform.app_enablements e ON e.app_id = a.id
      WHERE jsonb_typeof(a.manifest -> 'agent') = 'object'
      GROUP BY a.id, a.manifest -> 'agent'
      ORDER BY a.id`
    return rows.map((row) => ({ appId: row.app_id, agent: row.agent, htxCodes: row.htx_codes }))
  }

  async expireOrphaned(): Promise<number> {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', 'system:web', true)`
      return tx.$queryRaw<{ id: string }[]>`
        WITH expired AS (
          UPDATE platform.agent_proposals p
          SET status = 'expired'
          WHERE p.status = 'proposed' AND p.kind LIKE 'app.%'
            -- A built-in kind (M13) that happens to start with app. is not an action of an installed app.
            AND p.kind <> 'app.spec.approve'
            AND NOT EXISTS (
              SELECT 1
              FROM platform.installed_apps a
              JOIN platform.app_enablements e ON e.app_id = a.id AND e.htx_code IN (p.htx_code, '*')
              WHERE jsonb_typeof(a.manifest -> 'agent') = 'object'
                AND p.kind LIKE 'app.' || a.id || '.%')
          RETURNING p.id,
            CASE WHEN EXISTS (SELECT 1 FROM platform.installed_apps a WHERE p.kind LIKE 'app.' || a.id || '.%')
                 THEN 'app_disabled' ELSE 'app_removed' END AS reason
        )
        SELECT audit.record_event('web', 'agent.proposal.expired', id::text,
                 jsonb_build_object('actor', 'system:web', 'reason', reason))::text AS id
        FROM expired`
    })
    return rows.length
  }
}
