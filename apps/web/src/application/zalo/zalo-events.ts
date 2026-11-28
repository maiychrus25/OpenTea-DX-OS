// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { logger } from '@/lib/logger'
import type { ZaloEvent } from '@/domain/zalo/zalo-events'

/** What the phase 1 use cases need from the Zalo channel: a place to raise events. `ZaloNotifier` is one. */
export interface ZaloEventSink {
  enqueue(events: ZaloEvent | ZaloEvent[]): Promise<{ queued: number; skipped: number }>
}

/**
 * Raises events after the real work has committed. A failure is logged and swallowed: a message must never undo or
 * fail a weighing, a price or a settlement. The event keys make a later retry safe.
 */
export async function raiseZaloEvents(sink: ZaloEventSink | undefined, events: ZaloEvent[]): Promise<void> {
  if (!sink || events.length === 0) return
  try {
    await sink.enqueue(events)
  } catch (error) {
    logger.error('Zalo events were not queued', { error, kinds: Array.from(new Set(events.map((e) => e.kind))) })
  }
}

/** `1425000` -> `1.425.000đ`. */
export const dong = (vnd: string | number | bigint): string => `${String(vnd).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`

/** `12.5` -> `12,5`, the way a Vietnamese reader writes kilograms. */
export const kg = (value: number): string => String(value).replace('.', ',')
