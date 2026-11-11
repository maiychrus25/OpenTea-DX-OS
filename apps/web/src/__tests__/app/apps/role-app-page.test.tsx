// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerAppPage, { dynamic } from '@/app/manager/apps/[id]/[[...path]]/page'
import OfficerAppPage from '@/app/officer/apps/[id]/[[...path]]/page'
import FarmerAppPage from '@/app/farmer/apps/[id]/[[...path]]/page'

const find = jest.fn()

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
jest.mock('@/infrastructure/db/repositories/prisma-installed-app-repository', () => ({
  PrismaInstalledAppRepository: jest.fn().mockImplementation(() => ({ find: (id: string) => find(id) })),
}))

const managerOnly = {
  id: 'tea-tour',
  name: 'Tour chè',
  version: '1.0.0',
  menu: [{ label: 'Tour chè', path: '/', roles: ['manager'] }],
  publicPrefixes: [],
}

beforeEach(() => find.mockReset())

describe('/<role>/apps/[id]/[[...path]]', () => {
  test('is never statically rendered', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  test.each([
    ['manager', ManagerAppPage],
    ['officer', OfficerAppPage],
    ['farmer', FarmerAppPage],
  ])('%s: answers notFound when the app is not installed', async (_role, Page) => {
    find.mockResolvedValue(null)
    await expect(Page({ params: { id: 'nope' }, searchParams: {} })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(find).toHaveBeenCalledWith('nope')
  })

  test.each([
    ['officer', OfficerAppPage],
    ['farmer', FarmerAppPage],
  ])('%s: answers notFound when the app has no menu entry for the role', async (_role, Page) => {
    find.mockResolvedValue(managerOnly)
    await expect(Page({ params: { id: 'tea-tour' }, searchParams: {} })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  test('renders the frame on the proxy path with the shell query', async () => {
    find.mockResolvedValue(managerOnly)
    render(await ManagerAppPage({ params: { id: 'tea-tour', path: ['tours', '7'] }, searchParams: { said: 'hi' } }))
    const frame = screen.getByTitle('Tour chè')
    expect(frame.getAttribute('src')).toBe('/apps/tea-tour/tours/7?said=hi')
  })
})
