// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { JournalForm } from '@/app/officer/journal/_components/JournalForm'

jest.mock('idb-keyval', () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }))

const product = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false }

let posted: unknown
beforeEach(() => {
  posted = undefined
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/farm/parcels') return { ok: true, status: 200, json: async () => ({ data: [{ id: 'parcel-1', parcel_code: 'T-01', crop_type: 'Chè' }] }) }
    if (url.startsWith('/api/pesticides')) return { ok: true, status: 200, json: async () => ({ data: [product] }) }
    if (url === '/api/journal') { posted = JSON.parse(String(init?.body)); return { ok: true, status: 201, json: async () => ({ data: {} }) } }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

test('a SPRAYING row sends the product id and the withdrawal days', async () => {
  const onSuccess = jest.fn()
  render(<JournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted).toMatchObject({
    parcel_id: 'parcel-1',
    activities: [{ activity_type: 'SPRAYING', product_name: 'Abamec', pesticide_product_id: 'p1', withdrawal_days: 10 }],
  })
})

test('submit is locked while the days are under the floor', async () => {
  render(<JournalForm onSuccess={() => undefined} onCancel={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  fireEvent.change(screen.getByLabelText('Số ngày cách ly'), { target: { value: '2' } })
  expect(screen.getByRole('button', { name: 'Lưu nhật ký' })).toBeDisabled()
})

test('"Đốn chè" is selectable', async () => {
  render(<JournalForm onSuccess={() => undefined} onCancel={() => undefined} />)
  await screen.findByRole('button', { name: /Abamec/ })
  expect(screen.getByRole('option', { name: 'Đốn chè' })).toBeInTheDocument()
})
