// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import type { AgentSettingsRepository } from '@/domain/agent/ports/AgentSettingsRepository'

export const CROSS_CHECK_AGENT = 'cross-check'

/** Same defaults as `THRESHOLD_DEFAULTS["cross-check"]` in the Python agent. */
export const CROSS_CHECK_DEFAULTS = {
  grace_days: 10,
  fresh_norm_kg_per_ha_flush: 1800,
  norm_tolerance: 1.35,
  realert_extra: 0.2,
} as const

const twoDecimals = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((value) => Math.round(value * 100) / 100 === value, 'at most two decimals')

/** The cooperative head's edit: any subset of the four thresholds, at least one, nothing else. */
export const crossCheckThresholdsSchema = z
  .object({
    grace_days: z.number().int().min(3).max(30),
    fresh_norm_kg_per_ha_flush: z.number().int().min(300).max(6000),
    norm_tolerance: twoDecimals(1, 3),
    realert_extra: twoDecimals(0.05, 1),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one threshold')

export type CrossCheckThresholds = { -readonly [K in keyof typeof CROSS_CHECK_DEFAULTS]: number }

export class CrossCheckSettingsUseCase {
  constructor(private readonly settings: AgentSettingsRepository = new PrismaAgentSettingsRepository()) {}

  /** The four thresholds, a stored value of the right type over its default. */
  async read(htxCode: string): Promise<CrossCheckThresholds> {
    const stored = (await this.settings.findForEvidence(htxCode, CROSS_CHECK_AGENT))?.thresholds ?? {}
    const result: CrossCheckThresholds = { ...CROSS_CHECK_DEFAULTS }
    for (const key of Object.keys(CROSS_CHECK_DEFAULTS) as (keyof CrossCheckThresholds)[]) {
      const value = stored[key]
      if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
    }
    return result
  }

  async save(htxCode: string, actor: string, change: z.infer<typeof crossCheckThresholdsSchema>): Promise<CrossCheckThresholds> {
    await this.settings.upsertThresholds(htxCode, CROSS_CHECK_AGENT, change as Record<string, number>, actor)
    return this.read(htxCode)
  }
}
