// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { Scale } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import kit from '@/components/features/dashboard/page-kit.module.css'

export default async function AccountantDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<Scale size={28} />} title={`Xin chào, ${session.user.name || 'Kế toán'}`} description="Tổng quan của kế toán HTX." />
      <div className={kit.card}>
        <EmptyState icon={<Scale size={32} />} title="Bàn cân và quyết toán sẽ có ở đây khi HTX bật." />
      </div>
    </div>
  )
}
