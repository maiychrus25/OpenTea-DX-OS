// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { Intent } from '../chat/types'

const intentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tool'), name: z.string().min(1).max(64), args: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal('action'), name: z.string().min(1).max(64), args: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal('unknown') }),
])

/** Validates what A7 returned (contract C7). A bad shape counts as unknown. */
export function parseAssistantIntent(raw: unknown): Intent {
  const parsed = intentSchema.safeParse(raw)
  if (!parsed.success || parsed.data.type === 'unknown') return { type: 'unknown' }
  return { type: parsed.data.type, name: parsed.data.name, args: parsed.data.args ?? {} }
}
