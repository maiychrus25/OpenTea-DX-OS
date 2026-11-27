// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AccountantLayout from '@/app/accountant/layout'
import AccountantDashboard from '@/app/accountant/dashboard/page'

const getProfile = jest.fn()
jest.mock('@/auth', () => ({ auth: jest.fn() }))
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
  test('the dashboard is a real empty state with no figures', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'accountant', name: 'Lan', htxCode: 'TC' } })
    render(await AccountantDashboard())
    expect(screen.getByText('Bàn cân và quyết toán sẽ có ở đây khi HTX bật.')).toBeInTheDocument()
    expect(screen.getByText(/Lan/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d{2,}/)
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
