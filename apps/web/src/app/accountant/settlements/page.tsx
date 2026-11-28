// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SettlementList } from '@/components/features/ledger/SettlementList'

export default function AccountantSettlementsPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Wallet size={28} />} title="Quyết toán" description="Chuẩn bị kỳ quyết toán: tiền búp trừ vật tư ứng, rồi ghi chi trả." />
      <SettlementList basePath="/accountant" />
    </div>
  )
}
