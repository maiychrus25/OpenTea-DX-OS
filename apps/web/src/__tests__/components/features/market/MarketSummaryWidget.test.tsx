// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import useSWR from 'swr'
import { MarketSummaryWidget } from '@/components/features/market/MarketSummaryWidget'

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))

function serve(marketRow: object) {
  ;(useSWR as jest.Mock).mockImplementation((url: string) =>
    url.startsWith('/api/market-data/fx') ? { data: { data: [{ rates: { VND: 26000 } }] } } : { data: { data: [marketRow] } },
  )
}

describe('MarketSummaryWidget', () => {
  beforeEach(() => jest.clearAllMocks())

  it('asks for tea by default', () => {
    serve({ source: 'COMTRADE', commodity: 'Tea', metric: 'export_value_to_world', value: 250, unit: 'million_USD' })
    render(<MarketSummaryWidget />)
    expect(useSWR).toHaveBeenCalledWith(`/api/market-data?commodity=${encodeURIComponent('Chè')}`, expect.any(Function))
  })

  it('shows "Chưa có dữ liệu giá." when there is no market row', () => {
    ;(useSWR as jest.Mock).mockReturnValue({ data: { data: [] } })
    render(<MarketSummaryWidget />)
    expect(screen.getByText('Chưa có dữ liệu giá.')).toBeInTheDocument()
  })

  it('names no source it has no data from', () => {
    ;(useSWR as jest.Mock).mockReturnValue({ data: { data: [] } })
    render(<MarketSummaryWidget />)
    expect(screen.queryByText(/USDA/)).not.toBeInTheDocument()
  })

  it('shows no "giá mô phỏng" label', () => {
    serve({ source: 'COMTRADE', commodity: 'Tea', metric: 'export_value_to_world', value: 250, unit: 'million_USD' })
    render(<MarketSummaryWidget />)
    expect(screen.queryByText(/giá mô phỏng/)).not.toBeInTheDocument()
  })
})
