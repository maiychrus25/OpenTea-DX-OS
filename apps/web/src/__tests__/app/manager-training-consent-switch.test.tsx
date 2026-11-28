// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TrainingConsentSwitch } from '@/app/manager/profile/_components/TrainingConsentSwitch'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const wrap = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) })
const EXPLAIN = 'Ảnh được xoá vị trí GPS và thông tin máy chụp (EXIF), chỉ dùng để huấn luyện mô hình nhận diện sâu bệnh chè, và anh/chị có thể tắt bất cứ lúc nào.'

function routed(initial: unknown, put?: (body: { enabled: boolean }) => unknown) {
  const puts: { enabled: boolean }[] = []
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      puts.push(body)
      return wrap(put ? put(body) : { enabled: body.enabled, at: '2026-11-28T03:00:00.000Z', by: 'user-123' })
    }
    return wrap(initial)
  }) as unknown as typeof fetch
  return puts
}

beforeEach(() => jest.clearAllMocks())

test('the switch is off by default and shows the explanation, never the actor id', async () => {
  routed({ enabled: false, at: null, by: null })
  render(<TrainingConsentSwitch />)
  const sw = await screen.findByRole('switch', { name: /Cho phép dùng ảnh đã xác nhận/ })
  expect(sw).not.toBeChecked()
  expect(screen.getByText(EXPLAIN)).toBeInTheDocument()
  expect(screen.queryByText(/Cập nhật lúc/)).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('user-123')
})

test('turning it on asks to confirm first, and sends nothing until confirmed', async () => {
  const puts = routed({ enabled: false, at: null, by: null })
  render(<TrainingConsentSwitch />)
  fireEvent.click(await screen.findByRole('switch'))
  expect(screen.getByText(/Bật để dùng ảnh đã xác nhận/)).toBeInTheDocument()
  expect(puts).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bật' }))
  await waitFor(() => expect(puts).toEqual([{ enabled: true }]))
  expect(await screen.findByRole('switch')).toBeChecked()
  expect(screen.getByText(/Cập nhật lúc/)).toBeInTheDocument()
})

test('cancelling the confirm step leaves the switch off', async () => {
  const puts = routed({ enabled: false, at: null, by: null })
  render(<TrainingConsentSwitch />)
  fireEvent.click(await screen.findByRole('switch'))
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }))
  expect(screen.getByRole('switch')).not.toBeChecked()
  expect(puts).toHaveLength(0)
})

test('turning it off saves at once, with no confirm step', async () => {
  const puts = routed({ enabled: true, at: '2026-11-20T03:00:00.000Z', by: 'user-1' })
  render(<TrainingConsentSwitch />)
  fireEvent.click(await screen.findByRole('switch'))
  await waitFor(() => expect(puts).toEqual([{ enabled: false }]))
  expect(screen.queryByRole('button', { name: 'Xác nhận bật' })).not.toBeInTheDocument()
})

test('a failed load says so and offers no switch', async () => {
  global.fetch = jest.fn(async () => wrap(null, 500)) as unknown as typeof fetch
  render(<TrainingConsentSwitch />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được cài đặt huấn luyện.')
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})
