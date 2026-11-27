// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { DirectorBoard } from '@/domain/board/views'
import { DirectorBoardUseCase } from '@/application/board/DirectorBoardUseCase'
import { PrismaBoardSource } from '@/infrastructure/db/board/PrismaBoardSource'

/** The director board's one data step for the two dashboards; each block that fails comes back null. */
export function loadDirectorBoard(htxProfileId: string, now: Date, role: 'manager' | 'accountant'): Promise<DirectorBoard> {
  return new DirectorBoardUseCase(new PrismaBoardSource()).read(htxProfileId, now, role)
}
