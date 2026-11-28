// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ManagerHarvestBoard } from '@/app/manager/schedule/_components/ManagerHarvestBoard'

const today = new Date().toISOString()
const event = (cycleId: string, parcelName: string, extra: object = {}) => ({
  cycleId, parcelId: parcelName, parcelName, householdName: 'Lò Thị Mai', cropType: 'Chè', areaHa: 1.5, estimatedYieldKg: 200,
  harvestedKg: 50, estimatedHarvestDate: today, safeHarvestDate: null, status: 'SAFE', harvestedAt: null, ...extra,
})

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [event('a', 'P-1'), event('b', 'P-2', { harvestedAt: today })] }) })) as unknown as typeof fetch
})

it('shows the month figures, weighed against planned, and history on its tab', async () => {
  render(<SWRConfig value={{ provider: () => new Map() }}><ManagerHarvestBoard /></SWRConfig>)
  expect(await screen.findByText('P-1')).toBeInTheDocument()
  expect(screen.queryByText('P-2')).not.toBeInTheDocument()
  expect(screen.getAllByText('400 kg').length).toBeGreaterThan(0)
  expect(screen.getByText('25%')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Lịch sử thu hái' }))
  expect(screen.getByText('P-2')).toBeInTheDocument()
  expect(screen.queryByText('P-1')).not.toBeInTheDocument()
})
