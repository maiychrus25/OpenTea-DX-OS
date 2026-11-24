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
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE platform.agent_runs
        SET finished_at = now(),
            status = ${input.status},
            tokens_in = COALESCE(${input.tokensIn ?? null}::integer, tokens_in),
            tokens_out = COALESCE(${input.tokensOut ?? null}::integer, tokens_out),
            cost_estimate = COALESCE(${costDecimal}::numeric(12,4), cost_estimate),
            error = COALESCE(${input.error ?? null}::text, error)
        WHERE id = ${id}::uuid
          AND htx_code = ${htxCode}
        RETURNING id::text AS id
      `
      return rows.length > 0
    })
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
