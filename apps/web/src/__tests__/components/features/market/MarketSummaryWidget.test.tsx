// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import useSWR from 'swr'
import { MarketSummaryWidget } from '@/components/features/market/MarketSummaryWidget'
import { SIMULATED_MARKET_SOURCE } from '@/domain/market/simulated-price'

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

  it('labels a simulated price as giá mô phỏng', () => {
    serve({ source: SIMULATED_MARKET_SOURCE, commodity: 'Tea', metric: 'Giá chè búp khô', value: 200000, unit: 'VND/kg' })
    render(<MarketSummaryWidget />)
    expect(screen.getByText(/giá mô phỏng/)).toBeInTheDocument()
  })

  it('does not label a price from a real source', () => {
    serve({ source: 'COMTRADE', commodity: 'Tea', metric: 'export_value_to_world', value: 250, unit: 'million_USD' })
    render(<MarketSummaryWidget />)
    expect(screen.queryByText(/giá mô phỏng/)).not.toBeInTheDocument()
  })
})
