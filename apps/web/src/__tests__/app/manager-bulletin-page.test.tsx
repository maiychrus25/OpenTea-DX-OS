// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import ManagerBulletinPage from '@/app/manager/bulletin/page'

jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { htxCode: 'TC' } }) }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { bulletin: { findMany: jest.fn().mockResolvedValue([]) } } }))
jest.mock('@/app/manager/bulletin/_components/BulletinBanner', () => ({ BulletinBanner: () => null }))


test('manager bulletin page shows the empty state, not sample bulletins, when there is none', async () => {
  render(await ManagerBulletinPage({}))
  expect(screen.getByText('Chưa có bản tin nào')).toBeInTheDocument()
  expect(screen.getByText('0 bản tin')).toBeInTheDocument()
})
