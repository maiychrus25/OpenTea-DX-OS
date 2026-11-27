// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Receipt } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { LeafTicketList } from '@/components/features/weighing/LeafTicketList'

export default function ManagerLeafTicketsPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Receipt size={28} />} title="Phiếu cân" description="Phiếu cân búp tươi của HTX theo ngày, hộ và trạng thái." />
      <LeafTicketList />
    </div>
  )
}
