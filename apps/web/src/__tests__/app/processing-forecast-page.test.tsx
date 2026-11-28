// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { forecastForHtx } from '@/lib/forecast/forecast-page'
import ManagerProcessingPage from '@/app/manager/processing/page'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
jest.mock('@/lib/forecast/forecast-page', () => ({ forecastForHtx: jest.fn() }))
jest.mock('@/components/features/processing/ProcessingList', () => ({ ProcessingList: () => null }))

beforeEach(() => jest.clearAllMocks())

test('the processing page shows the forecast block for the session HTX', async () => {
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'manager', htxCode: 'TC' } })
  ;(forecastForHtx as jest.Mock).mockResolvedValue(null)
  render(await ManagerProcessingPage())
  expect(forecastForHtx).toHaveBeenCalledWith('TC')
  expect(screen.getByRole('heading', { name: 'Dự báo 14 ngày tới' })).toBeInTheDocument()
  expect(screen.getByText('Chưa tải được dự báo.')).toBeInTheDocument()
})

test('a session without the manager role is sent to login', async () => {
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'farmer' } })
  await expect(ManagerProcessingPage()).rejects.toThrow('NEXT_REDIRECT')
  expect(redirect).toHaveBeenCalledWith('/login')
})
