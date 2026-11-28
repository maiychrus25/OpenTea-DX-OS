// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { SettlementSlip } from '@/components/features/ledger/SettlementSlip'

/** The farmer's own slip: the API returns it masked for this role, so the page needs no extra check. */
export default function FarmerSlipPage({ params }: { params: { id: string; lineId: string } }) {
  return <SettlementSlip periodId={params.id} lineId={params.lineId} backHref="/farmer/ledger" />
}
