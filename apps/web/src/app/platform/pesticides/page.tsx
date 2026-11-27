// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { Leaf } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { pesticideProducts } from '@/lib/platform-pesticides'
import { PesticideTable } from '../_components/PesticideTable'

export const dynamic = 'force-dynamic'

export default async function PlatformPesticidesPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'platform_admin') redirect('/unauthorized')

  const rows = await pesticideProducts().findMany({ orderBy: { trade_name: 'asc' } })

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Leaf size={28} />}
        title="Danh mục thuốc BVTV"
        description="Sửa mức sàn ngày cách ly sau khi đối chiếu nhãn thuốc, rồi gỡ cờ cần đối chiếu."
      />
      <PesticideTable initialRows={rows} />
    </div>
  )
}
