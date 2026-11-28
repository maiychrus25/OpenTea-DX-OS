// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { NewWholesaleOrderPanel } from '@/components/features/sales/NewWholesaleOrderPanel'

export default async function AccountantNewSalesOrderPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<ShoppingCart size={28} />} title="Đơn bán sỉ mới" description="Chọn đối tác, các lô và số kg. Hạn thanh toán mặc định 30 ngày." />
      <NewWholesaleOrderPanel basePath="/accountant" />
    </div>
  )
}
