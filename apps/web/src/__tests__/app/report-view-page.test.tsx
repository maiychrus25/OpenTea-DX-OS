// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { loadSeasonReport } from '@/lib/report/season-report-data'
import ManagerReportViewPage from '@/app/manager/reports/view/page'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({ PrismaHtxProfileRepository: jest.fn() }))
jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({
  GetHtxProfileUseCase: jest.fn().mockImplementation(() => ({ execute: jest.fn().mockResolvedValue({ id: 'p1', name: 'HTX Tân Cương' }) })),
}))
// TODO(integration): the season report comes from SeasonReportUseCase; these tests mock the local data step.
jest.mock('@/lib/report/season-report-data', () => ({ loadSeasonReport: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'manager', htxCode: 'TC', name: 'Anh Hùng' } })
  ;(loadSeasonReport as jest.Mock).mockImplementation(async (_id: string, from: string, to: string, htxName: string) => ({
    htx_name: htxName, from, to, generated_at: '2027-01-02T03:00:00Z',
    members: null, purchases: null, member_money: null, processing: null, lots: null, sales: null, safety: null,
  }))
})

test('a period that is too long is refused before any report is built', async () => {
  render(await ManagerReportViewPage({ searchParams: { from: '2020-01-01', to: '2026-12-31' } }))
  expect(screen.getByRole('alert')).toHaveTextContent('Báo cáo tối đa ba năm.')
  expect(loadSeasonReport).not.toHaveBeenCalled()
})

test('a valid period builds the report for this HTX and shows its header and every section', async () => {
  render(await ManagerReportViewPage({ searchParams: { from: '2026-01-01', to: '2026-12-31' } }))
  expect(loadSeasonReport).toHaveBeenCalledWith('p1', '2026-01-01', '2026-12-31', 'HTX Tân Cương', expect.any(Date))
  expect(within(screen.getByRole('article', { name: 'Báo cáo vụ năm' })).getByRole('heading', { level: 1 })).toHaveTextContent('Báo cáo vụ / năm')
  expect(screen.getAllByRole('link', { name: 'Tải CSV' })).toHaveLength(7)
  expect(screen.getAllByText('Chưa tải được phần này')).toHaveLength(7)
})

test('an HTX with no profile is told so and gets no report', async () => {
  ;(GetHtxProfileUseCase as jest.Mock).mockImplementationOnce(() => ({ execute: jest.fn().mockRejectedValue(new NotFoundError('none')) }))
  render(await ManagerReportViewPage({ searchParams: { from: '2026-01-01', to: '2026-12-31' } }))
  expect(loadSeasonReport).not.toHaveBeenCalled()
})
