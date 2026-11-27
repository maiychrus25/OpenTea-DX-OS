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

const chooseType = (value: string) => fireEvent.change(screen.getByLabelText('Loại hoạt động'), { target: { value } })

test('FERTILIZING shows the product and dosage, with no picker or withdrawal days', async () => {
  const onSuccess = jest.fn()
  render(<JournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('button', { name: /Abamec/ })
  chooseType('FERTILIZING')
  expect(screen.getByLabelText('Tên sản phẩm')).toBeInTheDocument()
  expect(screen.getByLabelText('Liều lượng')).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Danh mục thuốc' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Số ngày cách ly')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'NPK 16-16-8' } })
  fireEvent.change(screen.getByLabelText('Liều lượng'), { target: { value: '20kg/sào' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted).toMatchObject({ activities: [{ activity_type: 'FERTILIZING', product_name: 'NPK 16-16-8', dosage: '20kg/sào' }] })
  expect((posted as { activities: object[] }).activities[0]).not.toHaveProperty('withdrawal_days')
})

test('HARVEST shows the fresh leaf weight, rejects an invalid one and sends a valid one', async () => {
  const onSuccess = jest.fn()
  render(<JournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('button', { name: /Abamec/ })
  chooseType('HARVEST')
  expect(screen.queryByLabelText('Tên sản phẩm')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Liều lượng')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Sản lượng búp tươi (kg)'), { target: { value: '100001' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('không quá 100000 kg')
  expect(posted).toBeUndefined()
  fireEvent.change(screen.getByLabelText('Sản lượng búp tươi (kg)'), { target: { value: '800' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(posted).toMatchObject({ activities: [{ activity_type: 'HARVEST', fresh_leaf_kg: 800 }] })
  expect((posted as { activities: object[] }).activities[0]).not.toHaveProperty('dosage')
})

test('HARVEST without a weight is sent without fresh_leaf_kg', async () => {
  const onSuccess = jest.fn()
  render(<JournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('button', { name: /Abamec/ })
  chooseType('HARVEST')
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect((posted as { activities: object[] }).activities[0]).toEqual({ activity_type: 'HARVEST' })
})

test('PRUNING shows no product or dosage fields and sends none', async () => {
  const onSuccess = jest.fn()
  render(<JournalForm onSuccess={onSuccess} onCancel={() => undefined} />)
  await screen.findByRole('button', { name: /Abamec/ })
  chooseType('PRUNING')
  expect(screen.queryByLabelText('Tên sản phẩm')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Liều lượng')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nhật ký' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect((posted as { activities: object[] }).activities[0]).toEqual({ activity_type: 'PRUNING' })
})
