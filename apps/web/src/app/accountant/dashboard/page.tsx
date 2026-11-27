// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { Scale } from 'lucide-react'
import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DirectorBoardView } from '@/components/features/board/DirectorBoardView'
import kit from '@/components/features/dashboard/page-kit.module.css'

export default async function AccountantDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'accountant') redirect('/login')

  // The money part of the board: blocks 1 to 3 and the money alerts.
  let profileId: string | null = null
  const htxCode = session.user.htxCode
  if (htxCode) {
    try {
      profileId = (await new GetHtxProfileUseCase(new PrismaHtxProfileRepository(prisma)).execute(htxCode)).id
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
  }
  const board = profileId ? await loadDirectorBoard(profileId, new Date(), 'accountant') : null

  return (
    <div className={kit.page}>
      <PageHeader icon={<Scale size={28} />} title={`Xin chào, ${session.user.name || 'Kế toán'}`} description="Tiền của HTX: búp thu hôm nay, giá, số tiền phải trả xã viên và cảnh báo về tiền." />
      {board ? (
        <DirectorBoardView board={board} role="accountant" />
      ) : (
        <div className={kit.card}>
          <EmptyState icon={<Scale size={32} />} title="Chưa có Hợp tác xã để hiển thị bảng điều hành." />
        </div>
      )}
    </div>
  )
}
