// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import { PartnerList } from './_components/PartnerList'
import Link from 'next/link'
import { Map, Plus } from 'lucide-react'
import { Button } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Danh bạ đối tác | DX-AgriMarket',
}

export default function PartnersPage() {
  return (
    <div className="h-full flex flex-col gap-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Danh bạ đối tác</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý danh sách đối tác mua bán, nhà cung cấp vật tư</p>
        </div>
        <div className="flex gap-3">
          <Link href="/manager/partner-map">
            <Button variant="secondary" className="flex items-center gap-2">
              <Map size={18} /> Bản đồ
            </Button>
          </Link>
          <Button className="flex items-center gap-2">
            <Plus size={18} /> Thêm đối tác
          </Button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <PartnerList />
      </div>
    </div>
  )
}
