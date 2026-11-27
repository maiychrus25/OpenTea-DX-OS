// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { LotFromBatchesPanel } from '@/components/features/lots/LotFromBatchesPanel'

export default async function OfficerLotsFromBatchesPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<Package size={28} />} title="Đóng lô từ mẻ" description="Chọn hạng chè khô và số kg lấy từ tồn của các mẻ đã hoàn thành." />
      <LotFromBatchesPanel basePath="/officer" />
    </div>
  )
}
