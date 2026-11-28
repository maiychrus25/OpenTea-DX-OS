// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SettlementList } from '@/components/features/ledger/SettlementList'

export default function ManagerSettlementsPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Wallet size={28} />} title="Quyết toán" description="Kỳ quyết toán của HTX. Trưởng HTX là người chốt kỳ." />
      <SettlementList basePath="/manager" />
    </div>
  )
}
