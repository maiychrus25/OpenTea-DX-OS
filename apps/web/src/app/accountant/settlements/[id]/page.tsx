// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SettlementPeriodView } from '@/components/features/ledger/SettlementPeriodView'

export default function AccountantSettlementPage({ params }: { params: { id: string } }) {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Wallet size={28} />} title="Kỳ quyết toán" description="Bản tính tạm từng hộ, và ghi chi trả sau khi trưởng HTX chốt kỳ." />
      <SettlementPeriodView periodId={params.id} canClose={false} basePath="/accountant" />
    </div>
  )
}
