// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { SettlementSlip } from '@/components/features/ledger/SettlementSlip'

export default function AccountantSlipPage({ params }: { params: { id: string; lineId: string } }) {
  return <SettlementSlip periodId={params.id} lineId={params.lineId} backHref={`/accountant/settlements/${params.id}`} />
}
