// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { List, Map as MapIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'

const PartnerMap = dynamic(() => import('@/components/features/partner-map/PartnerMap'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Đối tác',
  description: 'Quản lý bản đồ đối tác, người mua, nhà kho, đại lý.',
}

export default function ManagerPartnerMapPage() {
  return (
    <div className={kit.page}>
      <PageHeader
        icon={<MapIcon size={28} />}
        title="Bản đồ đối tác"
        description="Quản lý người mua, nhà kho, đại lý trực quan trên bản đồ"
        actions={
          <Link href="/manager/partners" className={kit.secondary}>
            <List size={16} aria-hidden="true" /> Danh bạ đối tác
          </Link>
        }
      />

      <section>
        <PartnerMap />
      </section>
    </div>
  )
}
