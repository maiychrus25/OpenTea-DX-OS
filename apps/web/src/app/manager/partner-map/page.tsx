// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'

const PartnerMap = dynamic(() => import('@/components/features/partner-map/PartnerMap'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Đối tác | DX-AgriMarket',
  description: 'Quản lý bản đồ đối tác, người mua, nhà kho, đại lý.',
}

export default function ManagerPartnerMapPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-primary)]">
          Bản đồ Đối tác
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">
          Quản lý các đối tác (người mua, nhà kho, đại lý) trực quan trên bản đồ.
        </p>
      </header>

      <section>
        <PartnerMap />
      </section>
    </div>
  )
}
