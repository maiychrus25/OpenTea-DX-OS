// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ReportPicker } from '@/components/features/report/ReportPicker'

export default async function AccountantReportsPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  return (
    <div className={kit.page}>
      <PageHeader icon={<FileText size={28} />} title="Báo cáo vụ / năm" description="Báo cáo cho Đại hội thành viên: chọn kỳ, rồi in hoặc tải CSV từng phần." />
      <ReportPicker basePath="/accountant" />
    </div>
  )
}
