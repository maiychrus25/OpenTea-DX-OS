// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PageHeader } from '@/components/ui/PageHeader'
import { Map as MapIcon } from 'lucide-react'
import kit from '@/components/features/dashboard/page-kit.module.css'
import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const FarmZoneReadOnly = dynamic(() => import('@/app/manager/farm-zones/_components/FarmZoneReadOnly'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Vùng trồng',
}

export default function OfficerFarmZonesPage() {
  return (
    <div className={`${kit.page} h-full`}>
      <PageHeader
        icon={<MapIcon size={28} />}
        title="Bản đồ vùng trồng"
        description="Xem và quản lý không gian các thửa đất trong Hợp tác xã"
        actions={<Link href="/officer/farm-zones/setup" className={kit.primary}>Thiết lập Vùng trồng mới</Link>}
      />
      <div style={{ flex: 1, minHeight: 600 }}>
        <FarmZoneReadOnly />
      </div>
    </div>
  )
}
