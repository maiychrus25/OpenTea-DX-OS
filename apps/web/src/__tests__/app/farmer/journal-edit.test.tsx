// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerJournalList } from '@/app/farmer/journal/_components/FarmerJournalList'
import { FarmerJournalEditClient } from '@/app/farmer/journal/[id]/edit/_components/FarmerJournalEditClient'

jest.mock('idb-keyval', () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }))
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

const product = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false }
const entry = (over: object) => ({
  id: 'e1', parcel_id: 'parcel-1', parcel_code: 'T-01', entry_date: '2026-11-20T00:00:00.000Z', activity_type: 'SPRAYING',
  performed_by: 'Nông hộ A', status: 'REQUEST_CHANGES', notes: 'Phun rầy', review_note: 'Thiếu liều',
  activities: [{ activity_detail: 'SPRAYING: Abamec', product_name: 'Abamec', dosage: '20ml', performer: 'A', withdrawal_days: 12, pesticide_product_id: 'p1' }],
  ...over,
})

let put: { url: string; body: any } | undefined
let putResponse: { ok: boolean; status: number; body: unknown }
function mockApi(entries: object[]) {
  put = undefined
  putResponse = { ok: true, status: 200, body: { data: {} } }
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { put = { url, body: JSON.parse(String(init.body)) }; return { ok: putResponse.ok, status: putResponse.status, json: async () => putResponse.body } }
    if (url === '/api/journal') return { ok: true, status: 200, json: async () => ({ data: entries }) }
    if (url === '/api/farm/parcels') return { ok: true, status: 200, json: async () => ({ data: [{ id: 'parcel-1', parcel_code: 'T-01', crop_type: 'Chè' }] }) }
    if (url.startsWith('/api/pesticides')) return { ok: true, status: 200, json: async () => ({ data: [product] }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
}

beforeEach(() => push.mockClear())

describe('buttons on the list', () => {
  test.each([['REQUEST_CHANGES', 'Sửa lại'], ['REJECTED', 'Sửa lại'], ['DRAFT', 'Đã phun']])('%s offers "%s" to the edit page', async (status, label) => {
    mockApi([entry({ status })])
    render(<FarmerJournalList />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp('Phun thuốc') }))
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', '/farmer/journal/e1/edit')
  })

  test('an approved entry offers neither', async () => {
    mockApi([entry({ status: 'APPROVED' })])
    render(<FarmerJournalList />)
    await screen.findByRole('button', { name: /Phun thuốc/ })
    expect(screen.queryByRole('link', { name: 'Sửa lại' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đã phun' })).not.toBeInTheDocument()
  })
})

describe('edit page', () => {
  test('"Gửi lại" sends PUT with the activities and submit: true', async () => {
    mockApi([entry({})])
    render(<FarmerJournalEditClient id="e1" />)
    expect(await screen.findByDisplayValue('Phun rầy')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi lại' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/farmer/journal'))
    expect(put?.url).toBe('/api/journal/e1')
    expect(put?.body).toMatchObject({
      submit: true, entry_date: '2026-11-20', observation: 'Phun rầy',
      activities: [{ activity_type: 'SPRAYING', pesticide_product_id: 'p1', dosage: '20ml', withdrawal_days: 12 }],
    })
    expect(put?.body.parcel_id).toBeUndefined()
  })

  test('"Đã phun" defaults the date to today and submits', async () => {
    mockApi([entry({ status: 'DRAFT', entry_date: '2026-10-01T00:00:00.000Z' })])
    render(<FarmerJournalEditClient id="e1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đã phun' }))
    await waitFor(() => expect(put).toBeDefined())
    expect(put?.body.entry_date).toBe(new Date().toISOString().slice(0, 10))
    expect(put?.body.submit).toBe(true)
  })

  test('a 422 shows the server message and stays on the page', async () => {
    mockApi([entry({})])
    render(<FarmerJournalEditClient id="e1" />)
    const button = await screen.findByRole('button', { name: 'Gửi lại' })
    putResponse = { ok: false, status: 422, body: { error: { code: 'WITHDRAWAL_BELOW_FLOOR', message: 'Thời gian cách ly không được thấp hơn 14 ngày (mức sàn của thuốc này).' } } }
    fireEvent.click(button)
    expect(await screen.findByText(/mức sàn của thuốc này/)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  test('an unknown id says so', async () => {
    mockApi([])
    render(<FarmerJournalEditClient id="nope" />)
    expect(await screen.findByText('Không tìm thấy nhật ký này.')).toBeInTheDocument()
  })
})
