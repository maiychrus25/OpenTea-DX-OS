// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import type {
  AgentRunRepository,
  FinishAgentRunInput,
  StartAgentRunInput,
} from '@/domain/agent/ports/AgentRunRepository'
import { prisma } from '@/infrastructure/db/prisma.client'

/** Persistence adapter for `platform.agent_runs` scoped by `htx_code`. */
export class PrismaAgentRunRepository implements AgentRunRepository {
  async start(input: StartAgentRunInput): Promise<{ id: string }> {
    const actor = `agent:${input.agent}`
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO platform.agent_runs (
          htx_code, agent, trigger, provider, model, prompt_version, input_hash
        ) VALUES (
          ${input.htxCode}, ${input.agent}, ${input.trigger},
          ${input.provider ?? null}, ${input.model ?? null},
          ${input.promptVersion ?? null}, ${input.inputHash ?? null}
        )
        RETURNING id::text AS id
      `
      return { id: rows[0].id }
    })
  }

  async finish(htxCode: string, id: string, input: FinishAgentRunInput): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', 'agent-runtime', true)`
      const costDecimal =
        input.costEstimate !== undefined && input.costEstimate !== null
          ? new Prisma.Decimal(input.costEstimate)
          : null
      const rows = await tx.$queryRaw<{ id: string; agent: string }[]>`
        UPDATE platform.agent_runs
        SET finished_at = now(),
            status = ${input.status},
            provider = COALESCE(${input.provider ?? null}::text, provider),
            model = COALESCE(${input.model ?? null}::text, model),
            tokens_in = COALESCE(${input.tokensIn ?? null}::integer, tokens_in),
            tokens_out = COALESCE(${input.tokensOut ?? null}::integer, tokens_out),
            cost_estimate = COALESCE(${costDecimal}::numeric(12,4), cost_estimate),
            error = COALESCE(${input.error ?? null}::text, error)
        WHERE id = ${id}::uuid
          AND htx_code = ${htxCode}
        RETURNING id::text AS id, agent
      `
      if (rows.length === 0) return false
      if (input.externalCalls && input.externalCalls > 0) {
        // Only what left the server is audited: provider, model, agent and the call count, never the content.
        const details = {
          actor: 'agent-runtime',
          htx_code: htxCode,
          agent: rows[0].agent,
          provider: input.provider ?? null,
          model: input.model ?? null,
          external_calls: input.externalCalls,
        }
        await tx.$executeRaw`
          SELECT audit.record_event('web', 'agent.external_call', ${id}, ${JSON.stringify(details)}::jsonb)
        `
      }
      return true
    })
  }

  /** Sum of `cost_estimate` for the cooperative's runs started in [start, end). */
  async spentBetween(htxCode: string, start: Date, end: Date): Promise<number> {
    const rows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS total
      FROM platform.agent_runs
      WHERE htx_code = ${htxCode}
        AND started_at >= ${start}
        AND started_at < ${end}
    `
    return rows[0]?.total ?? 0
  }

  async existsForHtx(htxCode: string, id: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id
      FROM platform.agent_runs
      WHERE id = ${id}::uuid
        AND htx_code = ${htxCode}
      LIMIT 1
    `
    return rows.length > 0
  }
}
