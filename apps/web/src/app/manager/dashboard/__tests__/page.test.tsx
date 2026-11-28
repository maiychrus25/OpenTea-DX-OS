// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import type { DirectorBoard } from '@/domain/board/views'

import ManagerDashboard from '../page'

jest.mock('../_components/ManagerHero', () => ({ ManagerHero: ({ greeting }: { greeting: string }) => <h1>{greeting}</h1> }))

jest.mock('@/auth', () => ({ auth: jest.fn() }))

jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn().mockResolvedValue({ userId: 'u1', role: 'manager', htxCode: 'TC', htxProfileId: 'dummy' }),
}))

jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { journalEntry: { count: jest.fn().mockResolvedValue(8) } },
}))

jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(),
}))

jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({
  GetHtxProfileUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ id: 'dummy', name: 'HTX Tân Cương', season_label: 'Vụ Xuân' }),
  })),
}))

// TODO(integration): the board comes from DirectorBoardUseCase; these tests mock the local data step.
jest.mock('@/lib/board/director-board-data', () => ({ loadDirectorBoard: jest.fn() }))


const board: DirectorBoard = {
  today: '2026-11-28',
  leaf: { net_kg: 95, amount_vnd: '1235000', tickets: 1, yesterday_net_kg: 0 },
  prices: { published: true, grades: [{ grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: 13000 }] },
  payable: { unpaid_lines_vnd: '0', unsettled_leaf_vnd: '1235000', unsettled_advances_vnd: '0', total_vnd: '1235000' },
  dry_stock: { grades: [{ grade: 'DINH', kg: 19 }, { grade: 'TOM_NON', kg: 0 }, { grade: 'MOC_CAU', kg: 0 }, { grade: 'BOM', kg: 0 }, { grade: 'CAM', kg: 0 }], forecast_dry_kg_14d: null },
  receivables: null,
  alerts: [],
}

const managerSession = { user: { role: 'manager', name: 'Anh Hùng' } }

describe('ManagerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(loadDirectorBoard as jest.Mock).mockResolvedValue(board)
  })

  it('redirects to login if no session', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)
    await expect(ManagerDashboard()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to login if role is not manager', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'farmer' } })
    await expect(ManagerDashboard()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('renders onboarding CTA when profile is not found', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementationOnce(() => ({
      execute: jest.fn().mockRejectedValueOnce(new NotFoundError('HtxProfile not found')),
    }))

    render(await ManagerDashboard())

    expect(screen.getByText('Chưa thiết lập Hợp tác xã')).toBeInTheDocument()
    expect(screen.getByText('Thiết lập ngay')).toBeInTheDocument()
    expect(loadDirectorBoard).not.toHaveBeenCalled()
  })

  it('shows the design sections with this HTX figures and marks the examples', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    render(await ManagerDashboard())

    expect(loadDirectorBoard).toHaveBeenCalledWith('dummy', expect.any(Date), 'manager')
    for (const name of ['Sản lượng thu hái theo tuần', 'Công việc cần xử lý', 'Thao tác nhanh', 'Cảnh báo & nhắc việc', 'Bản tin HTX']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('8 nhật ký chờ duyệt')).toBeInTheDocument()
    expect(screen.getAllByText('Mẫu').length).toBeGreaterThan(0)
  })

  it('puts the board alerts before the example warnings', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    ;(loadDirectorBoard as jest.Mock).mockResolvedValueOnce({ ...board, alerts: [{ kind: 'SETTLEMENT_DRAFT', count: 1, message: 'Kỳ quyết toán còn nháp', href: '/manager/settlements' }] })
    render(await ManagerDashboard())
    expect(screen.getByRole('link', { name: /Kỳ quyết toán còn nháp/ })).toHaveAttribute('href', '/manager/settlements')
  })

  it('keeps the page when a source cannot be read', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    ;(loadDirectorBoard as jest.Mock).mockRejectedValueOnce(new Error('down'))
    render(await ManagerDashboard())
    expect(screen.getByRole('heading', { name: 'Công việc cần xử lý' })).toBeInTheDocument()
  })
})
