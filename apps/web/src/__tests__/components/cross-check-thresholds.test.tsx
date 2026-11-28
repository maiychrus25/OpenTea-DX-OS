// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CrossCheckThresholdsSection, AGENT_CROSS_CHECK_URL } from '@/components/features/agent/CrossCheckThresholds'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body })

const thresholds = { grace_days: 10, fresh_norm_kg_per_ha_flush: 1800, norm_tolerance: 1.35, realert_extra: 0.2 }
const loaded = (canEdit = true) => ({ data: { thresholds, can_edit: canEdit } })

beforeEach(() => jest.clearAllMocks())

test('reads the cross-check route and shows the stored thresholds, with the re-alert step as percent', async () => {
  global.fetch = jest.fn(async () => json(loaded())) as unknown as typeof fetch
  render(<CrossCheckThresholdsSection />)
  expect(await screen.findByLabelText('Số ngày chờ ghi nhật ký phun sau khi ứng thuốc')).toHaveValue(10)
  expect(screen.getByLabelText('Định mức búp tươi (kg/ha/lứa)')).toHaveValue(1800)
  expect(screen.getByLabelText('Hệ số dung sai')).toHaveValue(1.35)
  expect(screen.getByLabelText('Báo lại khi vượt thêm (%)')).toHaveValue(20)
  expect(global.fetch).toHaveBeenCalledWith(AGENT_CROSS_CHECK_URL)
  expect(AGENT_CROSS_CHECK_URL).toBe('/api/agent/settings/cross-check')
})

test('sends the four keys to the cross-check route, with the percent turned into a fraction', async () => {
  const puts: { url: string; body: unknown }[] = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { puts.push({ url, body: JSON.parse(String(init.body)) }); return json(loaded()) }
    return json(loaded())
  }) as unknown as typeof fetch
  render(<CrossCheckThresholdsSection />)
  await screen.findByLabelText('Hệ số dung sai')
  fireEvent.change(screen.getByLabelText('Báo lại khi vượt thêm (%)'), { target: { value: '35' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ngưỡng' }))
  await waitFor(() => expect(puts).toHaveLength(1))
  expect(puts[0]).toEqual({
    url: '/api/agent/settings/cross-check',
    body: { grace_days: 10, fresh_norm_kg_per_ha_flush: 1800, norm_tolerance: 1.35, realert_extra: 0.35 },
  })
})

test('a value out of range gets its own message and no request is sent', async () => {
  const methods: (string | undefined)[] = []
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => { methods.push(init?.method); return json(loaded()) }) as unknown as typeof fetch
  render(<CrossCheckThresholdsSection />)
  await screen.findByLabelText('Hệ số dung sai')
  fireEvent.change(screen.getByLabelText('Số ngày chờ ghi nhật ký phun sau khi ứng thuốc'), { target: { value: '31' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ngưỡng' }))
  expect(await screen.findByText('Nhập số nguyên từ 3 đến 30.')).toBeInTheDocument()
  expect(methods).not.toContain('PUT')
})

test('shows the server validation message from a rejected save', async () => {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return json({ error: { code: 'VALIDATION_ERROR', message: 'Hệ số dung sai phải từ 1.00 đến 3.00.' } }, false)
    return json(loaded())
  }) as unknown as typeof fetch
  render(<CrossCheckThresholdsSection />)
  await screen.findByLabelText('Hệ số dung sai')
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ngưỡng' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Hệ số dung sai phải từ 1.00 đến 3.00.')
})

test('an officer sees the values read-only with no save button', async () => {
  global.fetch = jest.fn(async () => json(loaded(false))) as unknown as typeof fetch
  render(<CrossCheckThresholdsSection />)
  expect(await screen.findByLabelText('Hệ số dung sai')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Lưu ngưỡng' })).not.toBeInTheDocument()
})
