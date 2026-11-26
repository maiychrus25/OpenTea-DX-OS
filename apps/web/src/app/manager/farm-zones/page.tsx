// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import dynamic from 'next/dynamic'
import { Sprout } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'

const FarmZoneReadOnly = dynamic(() => import('./_components/FarmZoneReadOnly'), { ssr: false })

export default function Page() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Sprout size={28} />} title="Vùng trồng" description="Bản đồ và danh sách thửa canh tác của HTX (chỉ xem)" />
      <FarmZoneReadOnly />
    </div>
  )
}
