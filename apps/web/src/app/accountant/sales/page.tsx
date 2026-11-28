// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SalesListPanel } from '@/components/features/sales/SalesListPanel'

export default async function AccountantSalesPage({ searchParams }: { searchParams: { overdue?: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<ShoppingCart size={28} />} title="Bán hàng" description="Đơn bán sỉ và bán lẻ, lấy từ lô đã xuất QR. Thu tiền và theo dõi công nợ thương lái." />
      <SalesListPanel basePath="/accountant" initialOverdue={searchParams.overdue === '1'} />
    </div>
  )
}
