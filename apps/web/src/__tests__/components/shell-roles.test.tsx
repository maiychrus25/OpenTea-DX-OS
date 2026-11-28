// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen, within } from '@testing-library/react'
import { AppShell } from '@/components/layout/AppShell/AppShell'
import { TopBar } from '@/components/layout/TopBar/TopBar'
import { Sidebar } from '@/components/layout/Sidebar/Sidebar'

jest.mock('next/navigation', () => ({ usePathname: () => '/platform', useRouter: () => ({}) }))
jest.mock('@/components/ui', () => ({ NotificationBell: () => <span data-testid="bell" /> }))
jest.mock('@/components/ui/GlobalSearch/GlobalSearchInput', () => ({ GlobalSearchInput: () => <input aria-label="search" /> }))

test('farmer bottom navigation has its own order without changing the sidebar', () => {
  const navItems = [
    { label: 'Tổng quan', href: '/farmer/dashboard' },
    { label: 'Lịch thu hái', href: '/farmer/schedule' },
    { label: 'Nhật ký', href: '/farmer/journal' },
    { label: 'Sổ tiền', href: '/farmer/ledger' },
    { label: 'Chẩn đoán', href: '/farmer/diagnosis' },
  ].map(item => ({ ...item, icon: null }))
  render(<AppShell role="farmer" userName="An" navItems={navItems}>Nội dung</AppShell>)
  expect(within(screen.getByTestId('bottom-nav')).getAllByRole('link').map(link => link.textContent))
    .toEqual(['Tổng quan', 'Nhật ký', 'Chẩn đoán', 'Sổ tiền'])
  expect(within(screen.getByTestId('sidebar')).getAllByRole('link').filter(link =>
    navItems.some(item => item.href === link.getAttribute('href')),
  ).map(link => link.textContent)).toEqual(navItems.map(item => item.label))
})

describe('TopBar by role', () => {
  test('platform_admin has no bell and no search (it has no HTX)', () => {
    render(<TopBar role="platform_admin" roleName="Quản trị nền tảng" userName="Admin" />)
    expect(screen.queryByTestId('bell')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('search')).not.toBeInTheDocument()
  })

  test('accountant has the bell and no search', () => {
    render(<TopBar role="accountant" roleName="Kế toán" userName="Lan" />)
    expect(screen.getByTestId('bell')).toBeInTheDocument()
    expect(screen.queryByLabelText('search')).not.toBeInTheDocument()
  })

  test('manager keeps both', () => {
    render(<TopBar role="manager" roleName="Trưởng HTX" userName="An" />)
    expect(screen.getByTestId('bell')).toBeInTheDocument()
    expect(screen.getByLabelText('search')).toBeInTheDocument()
  })
})

describe('Sidebar profile popup', () => {
  const open = (role: string) => {
    render(<Sidebar navItems={[]} userName="Admin" role={role} />)
    screen.getByRole('button', { name: /Admin/ }).click()
  }

  test('platform_admin links to its own account page and has no notifications link', async () => {
    open('platform_admin')
    expect(await screen.findByRole('link', { name: /Tài khoản của tôi/ })).toHaveAttribute('href', '/platform/account')
    expect(screen.queryByRole('link', { name: /Thông báo/ })).not.toBeInTheDocument()
  })

  test('accountant links to its notifications page', async () => {
    open('accountant')
    expect(await screen.findByRole('link', { name: /Thông báo/ })).toHaveAttribute('href', '/accountant/notifications')
  })
})
