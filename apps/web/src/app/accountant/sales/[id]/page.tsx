// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SalesOrderDetailPanel } from '@/components/features/sales/SalesOrderDetailPanel'

export default async function AccountantSalesOrderPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<ShoppingCart size={28} />} title="Đơn bán" description="Các dòng, khoản thu và phiếu giao hàng của đơn." />
      <SalesOrderDetailPanel orderId={params.id} basePath="/accountant" canCancel={false} />
    </div>
  )
}
