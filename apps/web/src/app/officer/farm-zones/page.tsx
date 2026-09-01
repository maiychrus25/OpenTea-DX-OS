// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const FarmZoneReadOnly = dynamic(() => import('@/app/manager/farm-zones/_components/FarmZoneReadOnly'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Vùng trồng | DX-AgriMarket',
}

export default function OfficerFarmZonesPage() {
  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Bản đồ vùng trồng
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Xem và quản lý không gian các thửa đất trong Hợp tác xã.
          </p>
        </div>
        <Link href="/officer/farm-zones/setup" className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm text-sm">
          Thiết lập Vùng trồng mới
        </Link>
      </header>
      <div style={{ flex: 1, minHeight: 600 }}>
        <FarmZoneReadOnly />
      </div>
    </div>
  )
}
