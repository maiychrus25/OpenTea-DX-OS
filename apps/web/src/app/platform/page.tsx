// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PageHeader } from '@/components/ui/PageHeader'
import table from '@/components/features/dashboard/dashboard.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { CreateHtxButton } from './_components/CreateHtxButton'

export const dynamic = 'force-dynamic'

export default async function PlatformPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'platform_admin') redirect('/unauthorized')

  const htxs = await prisma.htxProfile.findMany({
    orderBy: { created_at: 'asc' },
    select: { id: true, htx_code: true, name: true, created_at: true, _count: { select: { households: true, memberships: true } } },
  })

  return (
    <div className={kit.page}>
      <PageHeader icon={<Building2 size={28} />} title="Hợp tác xã" description={`${htxs.length} hợp tác xã trên nền tảng`} actions={<CreateHtxButton />} />
      <div className={kit.card}>
        {htxs.length === 0 ? (
          <div className={kit.state}>Chưa có hợp tác xã nào.</div>
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">Mã</th>
                  <th scope="col">Tên</th>
                  <th scope="col">Số hộ</th>
                  <th scope="col">Số thành viên</th>
                  <th scope="col">Ngày tạo</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {htxs.map((htx) => (
                  <tr key={htx.id}>
                    <td>{htx.htx_code}</td>
                    <td>{htx.name}</td>
                    <td>{htx._count.households}</td>
                    <td>{htx._count.memberships}</td>
                    <td>{htx.created_at.toLocaleDateString('vi-VN')}</td>
                    <td><Link href={`/platform/htx/${htx.htx_code}/ai`} className={kit.linkButton}>Cấu hình AI</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
