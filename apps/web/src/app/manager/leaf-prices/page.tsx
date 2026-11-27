// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Banknote } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { LeafPricesPanel } from '@/components/features/weighing/LeafPricesPanel'

export default function LeafPricesPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Banknote size={28} />} title="Giá thu mua" description="Công bố giá búp mỗi ngày theo phẩm cấp." />
      <LeafPricesPanel />
    </div>
  )
}
