// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import { PartnerList } from './_components/PartnerList'
import Link from 'next/link'
import { Map, Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'

export const metadata: Metadata = {
  title: 'Danh bạ đối tác',
}

export default function PartnersPage() {
  return (
    <div className={`${kit.page} h-full`}>
      <PageHeader
        icon={<Users size={28} />}
        title="Danh bạ đối tác"
        description="Danh sách đối tác mua bán, nhà cung cấp vật tư"
        actions={
          <>
            <Link href="/manager/partner-map" className={kit.secondary}>
              <Map size={16} aria-hidden="true" /> Bản đồ
            </Link>
            <Link href="/manager/partner-map" className={kit.primary}>
              <Plus size={16} aria-hidden="true" /> Thêm đối tác
            </Link>
          </>
        }
      />
      
      <div className="flex-1 min-h-0 bg-card border border-border-subtle rounded-xl overflow-hidden shadow-sm">
        <PartnerList />
      </div>
    </div>
  )
}
