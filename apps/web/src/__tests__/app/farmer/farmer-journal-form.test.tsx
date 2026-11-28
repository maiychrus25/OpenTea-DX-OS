// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerJournalForm } from '@/app/farmer/journal/_components/FarmerJournalForm'

const mockStore: Record<string, any> = {}
jest.mock('idb-keyval', () => ({
  get: jest.fn(async (key: string) => mockStore[key]),
  set: jest.fn(async (key: string, value: unknown) => { mockStore[key] = value }),
  update: jest.fn(async (key: string, fn: (v: unknown) => unknown) => { mockStore[key] = fn(mockStore[key]) }),
}))

const product = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false }

let posted: any
beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k])
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
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

test('FERTILIZING shows the fertiliser and dosage, with no picker or withdrawal days', async () => {
  const onSuccess = jest.fn()
  render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('option', { name: /T-01/ })
  fireEvent.click(screen.getByRole('button', { name: 'Bón phân' }))
  expect(screen.getByLabelText('Sản phẩm sử dụng')).toBeInTheDocument()
  expect(screen.getByLabelText('Liều lượng')).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Danh mục thuốc' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Số ngày cách ly')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Sản phẩm sử dụng'), { target: { value: 'NPK 16-16-8' } })
  fireEvent.change(screen.getByLabelText('Liều lượng'), { target: { value: '20kg/sào' } })
  fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted.activities[0]).toEqual({ activity_type: 'FERTILIZING', product_name: 'NPK 16-16-8', dosage: '20kg/sào' })
})

test('HARVEST asks for the fresh leaf weight and hides the chemical fields', async () => {
  const onSuccess = jest.fn()
  render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('option', { name: /T-01/ })
  fireEvent.click(screen.getByRole('button', { name: 'Thu hoạch' }))
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Sản phẩm sử dụng')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Liều lượng')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  expect(await screen.findByText('Nhập sản lượng búp tươi (kg)')).toBeInTheDocument()
  expect(posted).toBeUndefined()
  fireEvent.change(screen.getByLabelText('Sản lượng búp tươi (kg)'), { target: { value: '12.5' } })
  fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted.activities[0]).toEqual({ activity_type: 'HARVEST', fresh_leaf_kg: 12.5 })
})

test('PRUNING shows no product, chemical, dosage or withdrawal fields', async () => {
  render(<FarmerJournalForm onSuccess={() => undefined} onCancel={() => undefined} />)
  await screen.findByRole('option', { name: /T-01/ })
  fireEvent.click(screen.getByRole('button', { name: 'Đốn chè' }))
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Sản phẩm sử dụng')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Liều lượng')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Số ngày cách ly')).not.toBeInTheDocument()
})

test('editing a returned HARVEST keeps the weight and sends it back', async () => {
  const onSuccess = jest.fn()
  let put: any
  const base = global.fetch as jest.Mock
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/journal/e1') { put = JSON.parse(String(init?.body)); return { ok: true, status: 200, json: async () => ({ data: {} }) } }
    return base(url, init)
  }) as unknown as typeof fetch
  render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined}
    entry={{ id: 'e1', parcel_id: 'parcel-1', entry_date: '2026-11-20T00:00:00Z', status: 'REQUEST_CHANGES', activity_type: 'HARVEST', notes: null, activities: [{ fresh_leaf_kg: 9 }] }} />)
  await screen.findByRole('option', { name: /T-01/ })
  expect(screen.getByLabelText('Sản lượng búp tươi (kg)')).toHaveValue(9)
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(put.activities[0]).toEqual({ activity_type: 'HARVEST', fresh_leaf_kg: 9 })
})

describe('offline queue', () => {
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /Gửi chờ duyệt/ }))
  const renderPruning = async (onSuccess: () => void) => {
    render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
    await screen.findByRole('option', { name: /T-01/ })
    fireEvent.click(screen.getByRole('button', { name: 'Đốn chè' }))
  }

  test('every POST carries a client_id', async () => {
    const onSuccess = jest.fn()
    await renderPruning(onSuccess)
    submit()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(posted.client_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('offline: nothing is posted, the entry is queued and the form closes', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const onSuccess = jest.fn()
    await renderPruning(onSuccess)
    submit()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(posted).toBeUndefined()
    expect(mockStore.journal_offline_queue).toHaveLength(1)
    expect(mockStore.journal_offline_queue[0].payload.activities[0].activity_type).toBe('PRUNING')
  })

  test('a dropped connection queues the entry with the same client_id', async () => {
    const original = global.fetch as jest.Mock
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/journal' && init?.method === 'POST') throw new TypeError('Failed to fetch')
      return original(url, init)
    }) as unknown as typeof fetch
    const onSuccess = jest.fn()
    await renderPruning(onSuccess)
    submit()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(mockStore.journal_offline_queue).toHaveLength(1)
    expect(mockStore.journal_offline_queue[0].client_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('an offline HARVEST keeps the fresh leaf weight in the queue', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const onSuccess = jest.fn()
    render(<FarmerJournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
    await screen.findByRole('option', { name: /T-01/ })
    fireEvent.click(screen.getByRole('button', { name: 'Thu hoạch' }))
    fireEvent.change(screen.getByLabelText('Sản lượng búp tươi (kg)'), { target: { value: '8' } })
    submit()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(mockStore.journal_offline_queue[0].payload.activities[0]).toEqual({ activity_type: 'HARVEST', fresh_leaf_kg: 8 })
  })
})
