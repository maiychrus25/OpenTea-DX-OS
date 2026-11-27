// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import PlatformLayout from '@/app/platform/layout'
import PlatformPage from '@/app/platform/page'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn(), useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { htxProfile: { findMany: jest.fn() } } }))
jest.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children, navItems }: { children: ReactNode; navItems: { label: string; href: string }[] }) => (
    <div><nav>{navItems.map((i) => <a key={i.href} href={i.href}>{i.label}</a>)}</nav>{children}</div>
  ),
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'pa-1', role: 'platform_admin', roles: ['platform_admin'], name: 'Admin', htxCode: null } })
})

describe('platform area', () => {
  test('the menu lists Hợp tác xã, Danh mục thuốc and Tài khoản', async () => {
    render(await PlatformLayout({ children: <p>x</p> }))
    expect(screen.getByRole('link', { name: 'Hợp tác xã' })).toHaveAttribute('href', '/platform')
    expect(screen.getByRole('link', { name: 'Danh mục thuốc' })).toHaveAttribute('href', '/platform/pesticides')
    expect(screen.getByRole('link', { name: 'Tài khoản' })).toHaveAttribute('href', '/platform/account')
  })

  test('each cooperative row links to its AI configuration', async () => {
    ;(prisma.htxProfile.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', htx_code: 'TC', name: 'HTX Tân Cương', created_at: new Date('2026-01-02'), _count: { households: 12, memberships: 15 } },
      { id: 'b', htx_code: 'LB', name: 'HTX La Bằng', created_at: new Date('2026-02-03'), _count: { households: 3, memberships: 4 } },
    ])
    render(await PlatformPage())
    const links = screen.getAllByRole('link', { name: 'Cấu hình AI' })
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/platform/htx/TC/ai', '/platform/htx/LB/ai'])
    expect(screen.getByText('HTX La Bằng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo HTX' })).toBeInTheDocument()
  })

  test('a cooperative without a code gets no AI link', async () => {
    ;(prisma.htxProfile.findMany as jest.Mock).mockResolvedValue([
      { id: 'n', htx_code: '', name: 'HTX No Code', created_at: new Date('2026-01-02'), _count: { households: 0, memberships: 0 } },
    ])
    render(await PlatformPage())
    expect(screen.queryByRole('link', { name: 'Cấu hình AI' })).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có mã HTX')).toBeInTheDocument()
  })

  test('the empty list says so', async () => {
    ;(prisma.htxProfile.findMany as jest.Mock).mockResolvedValue([])
    render(await PlatformPage())
    expect(screen.getByText('Chưa có hợp tác xã nào.')).toBeInTheDocument()
  })
})
