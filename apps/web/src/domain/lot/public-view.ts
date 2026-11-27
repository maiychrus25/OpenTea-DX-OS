// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LotTraceData } from '@/domain/entities/lot-trace-data'

/**
 * The trace data as the public page may show it. Names of people are removed unless the cooperative allows them;
 * done at render time, so snapshots stored before the setting existed are covered too. The input is not changed.
 */
export function publicView(trace: LotTraceData, showNames: boolean): LotTraceData {
  if (showNames) return trace
  return {
    ...trace,
    parcels: trace.parcels.map((p) => ({ ...p, household_name: '' })),
    journal_summaries: trace.journal_summaries.map((j) => ({ ...j, performed_by: '' })),
    ...(trace.batches ? { batches: trace.batches.map((b) => ({ ...b, master_name: null })) } : {}),
  }
}
