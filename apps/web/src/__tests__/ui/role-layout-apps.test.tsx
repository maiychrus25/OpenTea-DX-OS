// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import ManagerLayout from '@/app/manager/layout'
import OfficerLayout from '@/app/officer/layout'
import FarmerLayout from '@/app/farmer/layout'
import { logger } from '@/lib/logger'

const list = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn().mockImplementation(() => ({ getProfile: async () => ({ name: 'HTX', address: 'A' }) })),
}))
jest.mock('@/infrastructure/db/repositories/prisma-installed-app-repository', () => ({
  PrismaInstalledAppRepository: jest.fn().mockImplementation(() => ({ list: (htxCode: string | null) => list(htxCode) })),
}))
jest.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ navItems }: { navItems: { label: string; href: string }[] }) => (
    <ul>
      {navItems.map(item => (
        <li key={item.href} data-href={item.href}>
          {item.label}
        </li>
      ))}
    </ul>
  ),
}))

const hello = {
  id: 'hello',
  name: 'Xin chào',
  version: '0.1.0',
  menu: [{ label: 'Xin chào', path: '/', roles: ['farmer', 'officer', 'manager'] }],
  publicPrefixes: [],
}

describe.each([
  ['manager', ManagerLayout],
  ['officer', OfficerLayout],
  ['farmer', FarmerLayout],
])('%s layout', (role, Layout) => {
  const renderLayout = async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role, name: 'A', htxCode: 'TC' } })
    render(await Layout({ children: <p>page</p> }))
  }

  beforeEach(() => list.mockReset())

  test('appends the installed apps to the menu', async () => {
    list.mockResolvedValue([hello])
    await renderLayout()
    const items = screen.getAllByRole('listitem')
    expect(items[items.length - 1]).toHaveTextContent('Xin chào')
    expect(items[items.length - 1]).toHaveAttribute('data-href', `/${role}/apps/hello`)
    expect(screen.getByText('Tổng quan')).toBeInTheDocument()
  })

  test('asks for the apps enabled for the session HTX', async () => {
    list.mockResolvedValue([])
    await renderLayout()
    expect(list).toHaveBeenCalledWith('TC')
  })

  test('layouts keep their items when the app list fails', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    list.mockRejectedValue(new Error('db down'))
    await renderLayout()
    expect(screen.getByText('Tổng quan')).toBeInTheDocument()
    expect(screen.queryByText('Xin chào')).not.toBeInTheDocument()
    expect(logError).toHaveBeenCalled()
    logError.mockRestore()
  })
})

test('the manager menu links the App Store', async () => {
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'manager', name: 'A', htxCode: 'TC' } })
  list.mockResolvedValue([])
  render(await ManagerLayout({ children: <p>page</p> }))
  expect(screen.getByText('Kho ứng dụng')).toHaveAttribute('data-href', '/manager/app-store')
})
