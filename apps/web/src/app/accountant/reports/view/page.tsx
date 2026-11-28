// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ReportView } from '@/components/features/report/ReportView'
import { loadSeasonReport } from '@/lib/report/season-report-data'
import { periodProblem } from '@/lib/report/period'

export default async function AccountantReportViewPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  const from = searchParams.from
  const to = searchParams.to
  const problem = periodProblem(from, to)
  const pickerHref = '/accountant/reports'

  let profile: { id: string; name: string | null } | null = null
  const htxCode = session.user.htxCode
  if (htxCode && !problem) {
    try {
      profile = await new GetHtxProfileUseCase(new PrismaHtxProfileRepository(prisma)).execute(htxCode)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
  }

  return (
    <div className={kit.page}>
      <PageHeader icon={<FileText size={28} />} title="Báo cáo vụ / năm" description="Báo cáo cho Đại hội thành viên." />
      {problem ? (
        <p role="alert" className={kit.muted}>{problem}</p>
      ) : profile ? (
        <ReportView report={await loadSeasonReport(profile.id, from!, to!, profile.name ?? '', new Date())} pickerHref={pickerHref} />
      ) : (
        <p role="alert" className={kit.muted}>Chưa có Hợp tác xã để lập báo cáo.</p>
      )}
    </div>
  )
}
