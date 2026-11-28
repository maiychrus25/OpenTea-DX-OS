// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import OfficerDiseaseDetailPage from '@/app/officer/diseases/[id]/page'

jest.mock('idb-keyval', () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/lib/api/redirect-to-login', () => ({ redirectToLogin: jest.fn() }))

const product = { id: 'p1', trade_name: 'Abamec', active_ingredient: 'abamectin', group: 'CHEMICAL', targets: [], default_phi_days: 7, floor_days: 10, label: null, needs_label_check: false }
let review: any
beforeEach(() => {
  review = undefined
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/officer/diseases') return { ok: true, status: 200, json: async () => ({ data: [{ id: 'd1', ai_disease_name: 'Thán thư', ai_confidence: 0.9, farmer_name: 'A', parcel_code: 'P-1', detection_date: '2026-11-10T00:00:00Z' }] }) }
    if (url.startsWith('/api/pesticides')) return { ok: true, status: 200, json: async () => ({ data: [product] }) }
    if (url === '/api/disease-labels') return { ok: true, status: 200, json: async () => ({ data: [{ code: 'green_leafhopper', name_vi: 'Rầy xanh', scientific_name: null, group: 'PEST', is_target: true, sort_order: 1 }] }) }
    review = JSON.parse(String(init?.body))
    return { ok: true, status: 200, json: async () => ({ data: {} }) }
  }) as unknown as typeof fetch
})

const fill = async () => {
  await screen.findByLabelText(/^Tên bệnh đã xác nhận/)
  fireEvent.change(screen.getByLabelText(/Nhập hướng dẫn/), { target: { value: 'Cắt lá bệnh' } })
  fireEvent.change(await screen.findByLabelText('Nhãn bệnh/sâu (Bắt buộc khi Duyệt)'), { target: { value: 'green_leafhopper' } })
}

test('the prescription is optional and hidden until opened', async () => {
  render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
  await fill()
  expect(screen.queryByLabelText('Liều dùng')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))
  await waitFor(() => expect(review).toBeDefined())
  expect(review.prescription).toBeUndefined()
})

test('CONFIRMED sends the chosen product and dosage', async () => {
  render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Kê đơn (tuỳ chọn)' }))
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  expect(screen.queryByRole('button', { name: /Thuốc khác/ })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Liều dùng'), { target: { value: '20ml/bình' } })
  fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))
  await waitFor(() => expect(review).toBeDefined())
  expect(review).toMatchObject({ status: 'CONFIRMED', prescription: { pesticide_product_id: 'p1', dosage: '20ml/bình' } })
})

test('REJECTED never carries a prescription', async () => {
  render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Kê đơn (tuỳ chọn)' }))
  fireEvent.click(await screen.findByRole('button', { name: /Abamec/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }))
  await waitFor(() => expect(review).toBeDefined())
  expect(review.status).toBe('REJECTED')
  expect(review.prescription).toBeUndefined()
})
