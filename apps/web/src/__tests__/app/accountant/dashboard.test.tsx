// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AccountantLayout from '@/app/accountant/layout'
import AccountantDashboard from '@/app/accountant/dashboard/page'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import type { DirectorBoard } from '@/domain/board/views'

const getProfile = jest.fn()
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({ GetHtxProfileUseCase: jest.fn() }))
// TODO(integration): the money board comes from DirectorBoardUseCase; these tests mock the local data step.
jest.mock('@/lib/board/director-board-data', () => ({ loadDirectorBoard: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ getProfile: (code: string) => getProfile(code) })),
}))
jest.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children, navItems }: { children: ReactNode; navItems: { label: string }[] }) => (
    <div><nav>{navItems.map((i) => <span key={i.label}>{i.label}</span>)}</nav>{children}</div>
  ),
}))

beforeEach(() => {
  jest.clearAllMocks()
  getProfile.mockResolvedValue({ name: 'HTX Tân Cương', address: 'Thái Nguyên' })
})

describe('accountant area', () => {
  test('the dashboard shows the money blocks and no stock or wholesale block', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'accountant', name: 'Lan', htxCode: 'TC' } })
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementation(() => ({ execute: jest.fn().mockResolvedValue({ id: 'p1' }) }))
    const board: DirectorBoard = {
      today: '2026-11-28',
      leaf: { net_kg: 95, amount_vnd: '1235000', tickets: 1, yesterday_net_kg: 0 },
      prices: { published: false, grades: [] },
      payable: { unpaid_lines_vnd: '0', unsettled_leaf_vnd: '1235000', unsettled_advances_vnd: '0', total_vnd: '1235000' },
      dry_stock: null,
      receivables: { available: false },
      alerts: [],
    }
    ;(loadDirectorBoard as jest.Mock).mockResolvedValue(board)
    render(await AccountantDashboard())
    expect(loadDirectorBoard).toHaveBeenCalledWith('p1', expect.any(Date), 'accountant')
    expect(screen.getByRole('region', { name: 'Búp thu hôm nay' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Phải trả xã viên' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tồn chè khô' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Thương lái còn nợ' })).not.toBeInTheDocument()
    expect(screen.getByText(/Lan/)).toBeInTheDocument()
  })

  test('with no HTX profile the page is an empty state and loads no figures', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'accountant', name: 'Lan', htxCode: 'TC' } })
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementation(() => ({ execute: jest.fn().mockRejectedValue(new NotFoundError('none')) }))
    render(await AccountantDashboard())
    expect(screen.getByText('Chưa có Hợp tác xã để hiển thị bảng điều hành.')).toBeInTheDocument()
    expect(loadDirectorBoard).not.toHaveBeenCalled()
  })

  test('the layout lists Tổng quan, Thông báo, Tài khoản', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'accountant', name: 'Lan', htxCode: 'TC', roles: ['accountant'] } })
    render(await AccountantLayout({ children: <p>content</p> }))
    for (const label of ['Tổng quan', 'Thông báo', 'Tài khoản']) expect(screen.getByText(label)).toBeInTheDocument()
  })

  test('another active role is sent away', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'manager', htxCode: 'TC' } })
    await AccountantLayout({ children: null })
    expect(redirect).toHaveBeenCalledWith('/unauthorized')
  })
})
