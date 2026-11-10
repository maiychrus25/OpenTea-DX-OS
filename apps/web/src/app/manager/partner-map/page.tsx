// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { List } from 'lucide-react'
import { Button } from '@/components/ui'

const PartnerMap = dynamic(() => import('@/components/features/partner-map/PartnerMap'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Đối tác',
  description: 'Quản lý bản đồ đối tác, người mua, nhà kho, đại lý.',
}

export default function ManagerPartnerMapPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-primary)]">
            Bản đồ Đối tác
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">
            Quản lý các đối tác (người mua, nhà kho, đại lý) trực quan trên bản đồ.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/manager/partners">
            <Button variant="secondary" className="flex items-center gap-2">
              <List size={18} aria-hidden="true" /> Danh bạ đối tác
            </Button>
          </Link>
        </div>
      </header>

      <section>
        <PartnerMap />
      </section>
    </div>
  )
}
