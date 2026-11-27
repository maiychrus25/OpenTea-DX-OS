// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DirectorBoard } from '@/domain/board/views'
import { localDay } from '@/domain/shared/local-day'

/**
 * The director board's one data step for the two dashboards.
 * TODO(integration): DirectorBoardUseCase (phase 3 B1): return new DirectorBoardUseCase(new PrismaBoardSource()).read(htxProfileId, now, role).
 * Until it lands every block is null, so each block shows its own "Chưa tải được" state and the page still renders.
 */
export async function loadDirectorBoard(_htxProfileId: string, now: Date, _role: 'manager' | 'accountant'): Promise<DirectorBoard> {
  return {
    today: localDay(now),
    leaf: null,
    prices: null,
    payable: null,
    dry_stock: null,
    receivables: { available: false },
    alerts: null,
  }
}
