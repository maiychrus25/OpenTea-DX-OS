// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerJournalForm } from '@/app/farmer/journal/_components/FarmerJournalForm'

jest.mock('idb-keyval', () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }))

const product = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false }

let posted: any
beforeEach(() => {
  posted = undefined
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/farm/parcels') return { ok: true, status: 200, json: async () => ({ data: [{ id: 'parcel-1', parcel_code: 'T-01', crop_type: 'Chè' }] }) }
    if (url.startsWith('/api/pesticides')) return { ok: true, status: 200, json: async () => ({ data: [product] }) }
    if (url === '/api/journal') { posted = JSON.parse(String(init?.body)); return { ok: true, status: 201, json: async () => ({ data: {} }) } }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const openSpraying = async () => {
  render(<FarmerJournalForm onSuccess={jest.fn()} onCancel={() => undefined} initial={{ activityType: 'SPRAYING' }} />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
}

test('a SPRAYING entry sends the catalogue product and the floor days', async () => {
  const onSuccess = jest.fn()
  render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} initial={{ activityType: 'SPRAYING' }} />)
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted.activities[0]).toMatchObject({ activity_type: 'SPRAYING', pesticide_product_id: 'p1', product_name: 'Abamec', withdrawal_days: 10 })
})

test('days under the floor show the error and lock submit', async () => {
  await openSpraying()
  fireEvent.change(screen.getByLabelText('Số ngày cách ly'), { target: { value: '3' } })
  expect(screen.getByText('Thời gian cách ly không được thấp hơn 10 ngày')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Gửi chờ duyệt/ })).toBeDisabled()
})

test('"Đốn chè" is selectable and sent without pesticide fields', async () => {
  const onSuccess = jest.fn()
  render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('option', { name: /T-01/ })
  fireEvent.click(screen.getByRole('button', { name: 'Đốn chè' }))
  fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted.activities[0]).toMatchObject({ activity_type: 'PRUNING' })
  expect(posted.activities[0].pesticide_product_id).toBeUndefined()
})
