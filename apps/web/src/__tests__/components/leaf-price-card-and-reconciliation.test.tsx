// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LeafPriceCard } from '@/components/features/weighing/LeafPriceCard'
import { WeighingReconciliation } from '@/components/features/weighing/WeighingReconciliation'

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

describe('farmer price card', () => {
  test('shows each published grade price', async () => {
    global.fetch = jest.fn(async () => ok({ data: {
      date: '2026-11-28', published_at: '2026-11-28T01:00:00Z',
      prices: [
        { grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: 13000, yesterday_vnd_per_kg: 12000 },
        { grade_id: 'g2', grade_name: 'Loại 2', price_vnd_per_kg: null, yesterday_vnd_per_kg: null },
      ],
    } })) as unknown as typeof fetch
    render(<LeafPriceCard />)
    expect(await screen.findByText('13.000 đ/kg')).toBeInTheDocument()
    expect(screen.getByText('Loại 1')).toBeInTheDocument()
    expect(screen.queryByText('Loại 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nghe giá' })).toBeInTheDocument()
  })

  test('says the cooperative has not published today when no grade has a price', async () => {
    global.fetch = jest.fn(async () => ok({ data: { date: '2026-11-28', published_at: null, prices: [
      { grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: null, yesterday_vnd_per_kg: 12000 },
    ] } })) as unknown as typeof fetch
    render(<LeafPriceCard />)
    expect(await screen.findByText('HTX chưa công bố giá hôm nay.')).toBeInTheDocument()
  })
})

describe('harvest reconciliation', () => {
  test('shows the weighed kg against the journal kg for the flush', async () => {
    global.fetch = jest.fn(async () => ok({ data: { ticket_net_kg: 950.5, journal_fresh_leaf_kg: 1000 } })) as unknown as typeof fetch
    render(<WeighingReconciliation cycleId="c1" />)
    expect(await screen.findByText('Cân thực tế 950,5 kg / Nhật ký 1.000 kg')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/cycles/c1/weighing-summary')
  })

  test('the empty state explains there is nothing to compare yet', async () => {
    global.fetch = jest.fn(async () => ok({ data: { ticket_net_kg: 0, journal_fresh_leaf_kg: 0 } })) as unknown as typeof fetch
    render(<WeighingReconciliation cycleId="c1" />)
    expect(await screen.findByText('Chưa có phiếu cân hay nhật ký thu hái cho lứa này.')).toBeInTheDocument()
  })
})
