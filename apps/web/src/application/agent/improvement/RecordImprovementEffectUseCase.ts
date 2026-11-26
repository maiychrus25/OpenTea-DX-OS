// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { EffectResult, ImprovementRepository } from '@/domain/agent/ports/ImprovementRepository'

/** Body of `POST /api/internal/agent/improvements/{id}/effect` (contract C5). */
export const improvementEffectSchema = z
  .object({
    after: z.enum(['2w', '4w']),
    value: z.number().finite(),
    verdict: z.enum(['helped', 'no_effect', 'drop']),
  })
  .strict()

export type ImprovementEffectInput = z.infer<typeof improvementEffectSchema>

/** Records A10's measurement of an adopted improvement; the answer tells the route which status code to give. */
export class RecordImprovementEffectUseCase {
  constructor(private readonly improvements: Pick<ImprovementRepository, 'recordEffect'>) {}

  execute(htxCode: string, id: string, input: ImprovementEffectInput, now: Date = new Date()): Promise<EffectResult> {
    return this.improvements.recordEffect(htxCode, id, input.after, {
      value: input.value,
      verdict: input.verdict,
      at: now,
    })
  }
}
