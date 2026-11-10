// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import ManagerLayout from '@/app/manager/layout'
import OfficerLayout from '@/app/officer/layout'
import FarmerLayout from '@/app/farmer/layout'

const getProfile = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn().mockImplementation(() => ({ getProfile: (code: string) => getProfile(code) })),
}))
jest.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}))

const NOTICE = 'Tài khoản chưa được gán Hợp tác xã'

describe.each([
  ['manager', ManagerLayout],
  ['officer', OfficerLayout],
  ['farmer', FarmerLayout],
])('%s layout', (role, Layout) => {
  const renderLayout = async (htxCode: string | null) => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role, name: 'A', htxCode } })
    render(await Layout({ children: <p>page content</p> }))
  }

  beforeEach(() => getProfile.mockReset())

  test('shows the notice instead of the page when the account has no code', async () => {
    await renderLayout(null)
    expect(screen.getByText(NOTICE)).toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
    expect(getProfile).not.toHaveBeenCalled()
  })

  test('shows the notice instead of the page when the code matches no HTX', async () => {
    getProfile.mockResolvedValue(null)
    await renderLayout('XX')
    expect(screen.getByText(NOTICE)).toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
  })

  test('keeps the shell, and so sign-out, around the notice', async () => {
    await renderLayout(null)
    expect(screen.getByTestId('app-shell')).toContainElement(screen.getByText(NOTICE))
  })

  test('renders the page for a known HTX', async () => {
    getProfile.mockResolvedValue({ name: 'HTX Tân Cương', address: 'A' })
    await renderLayout('TC')
    expect(screen.getByText('page content')).toBeInTheDocument()
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
  })
})
