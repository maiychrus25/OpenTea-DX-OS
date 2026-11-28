// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import type { DirectorBoard } from '@/domain/board/views'

import ManagerDashboard from '../page'

const mockIsEnabledFor = jest.fn()

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
  prisma: {
    journalEntry: { findMany: jest.fn().mockResolvedValue([]) },
  },
}))

jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(),
}))

jest.mock('@/infrastructure/db/repositories/prisma-installed-app-repository', () => ({
  PrismaInstalledAppRepository: jest.fn().mockImplementation(() => ({ isEnabledFor: mockIsEnabledFor })),
}))

jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({
  GetHtxProfileUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ id: 'dummy', name: 'HTX Tân Cương', season_label: 'Vụ Xuân' }),
  })),
}))

// TODO(integration): the board comes from DirectorBoardUseCase; these tests mock the local data step.
jest.mock('@/lib/board/director-board-data', () => ({ loadDirectorBoard: jest.fn() }))

jest.mock('@/components/features/dashboard/NoticesAndWeather', () => ({
  NoticesAndWeather: () => null,
  RainAlert: () => null,
}))

jest.mock('@/components/features/dashboard/PendingJournals', () => ({
  PendingJournals: () => null,
}))

const board: DirectorBoard = {
  today: '2026-11-28',
  leaf: { net_kg: 95, amount_vnd: '1235000', tickets: 1, yesterday_net_kg: 0 },
  prices: { published: true, grades: [{ grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: 13000 }] },
  payable: { unpaid_lines_vnd: '0', unsettled_leaf_vnd: '1235000', unsettled_advances_vnd: '0', total_vnd: '1235000' },
  dry_stock: [{ grade: 'DINH', kg: 19 }, { grade: 'TOM_NON', kg: 0 }, { grade: 'MOC_CAU', kg: 0 }, { grade: 'BOM', kg: 0 }, { grade: 'CAM', kg: 0 }],
  receivables: null,
  alerts: [],
}

const managerSession = { user: { role: 'manager', name: 'Anh Hùng' } }

describe('ManagerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsEnabledFor.mockResolvedValue(false)
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

  it('renders the six blocks from the board for this HTX and the head', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    render(await ManagerDashboard())

    expect(loadDirectorBoard).toHaveBeenCalledWith('dummy', expect.any(Date), 'manager')
    const grid = screen.getByTestId('director-board')
    expect(within(grid).getAllByRole('heading', { level: 2 })).toHaveLength(6)
    expect(within(screen.getByRole('region', { name: 'Búp thu hôm nay' })).getByText('95,0 kg')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Có gì đỏ' })).toBeInTheDocument()
  })

  it('shows the analysis link only when the analysis app is enabled for the HTX', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    mockIsEnabledFor.mockResolvedValueOnce(true)
    const { unmount } = render(await ManagerDashboard())
    expect(screen.getByRole('link', { name: /Phân tích chi tiết/ })).toHaveAttribute('href', '/manager/apps/htx-dashboard')
    expect(mockIsEnabledFor).toHaveBeenCalledWith('htx-dashboard', 'TC')
    unmount()

    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    render(await ManagerDashboard())
    expect(screen.queryByRole('link', { name: /Phân tích chi tiết/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Giá chè thế giới/ })).toHaveAttribute('href', '/manager/bulletin')
  })

  it('the old market panel and the parcel table are gone', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    render(await ManagerDashboard())
    expect(screen.queryByText('Chỉ số giá nông sản')).not.toBeInTheDocument()
    expect(screen.queryByText('Tình trạng thửa đất')).not.toBeInTheDocument()
  })

  it('a block that failed to load shows its own state and the others still show', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(managerSession)
    ;(loadDirectorBoard as jest.Mock).mockResolvedValueOnce({ ...board, leaf: null })
    render(await ManagerDashboard())
    expect(screen.getByText('Chưa tải được số liệu thu mua hôm nay.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giá thu mua hôm nay' })).toBeInTheDocument()
    expect(screen.getByText('Loại 1')).toBeInTheDocument()
  })
})
