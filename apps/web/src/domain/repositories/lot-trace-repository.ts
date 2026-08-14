// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceData } from '../entities/lot-trace-data'

export interface LotTraceRepository {
  getLotByCode(lot_code: string): Promise<LotTraceData | null>
}
