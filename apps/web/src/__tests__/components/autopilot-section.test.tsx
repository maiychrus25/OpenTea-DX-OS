// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { signIn } from 'next-auth/react'
import { AutopilotSection } from '@/components/features/agent/AutopilotSection'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchJsonMock = jest.fn()
jest.mock('@/lib/api/fetch-json', () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
  LOAD_FAILED_MESSAGE: 'Không thể tải dữ liệu. Vui lòng thử lại sau.',
}))

const kinds = [
  { kind: 'notification.internal', title_vi: 'Thông báo nội bộ', autonomy: 'auto', risk: 'low', window_minutes: 0, match_rate: 0.97, sample: 30, warning: false },
  { kind: 'journal.reject', title_vi: 'Yêu cầu sửa nhật ký', autonomy: 'auto', risk: 'medium', window_minutes: 15, match_rate: 0.8, sample: 10, warning: true },
  { kind: 'harvest.approve', title_vi: 'Duyệt thu hoạch', autonomy: 'unlockable', risk: 'high', window_minutes: 120, match_rate: null, sample: 0, warning: false },
  { kind: 'journal.approve', title_vi: 'Duyệt nhật ký canh tác', autonomy: 'unlockable', risk: 'medium', window_minutes: 15, match_rate: 0.95, sample: 20, warning: false },
  { kind: 'improvement.adopt', title_vi: 'Áp dụng cải tiến', autonomy: 'never', risk: 'low', window_minutes: 0, match_rate: null, sample: 0, warning: false },
]

function status(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    enabled_by_name: null,
    stop_reason: null,
    daily_cap: 50,
    unlocked_kinds: [],
    kinds,
    today: { ran: 0, blocked: 0, pending: 0 },
    can_enable: true,
    ...overrides,
  }
}

function respond(ok: boolean, status: number, body: unknown) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok, status, json: async () => body })
}

describe('AutopilotSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchJsonMock.mockResolvedValue({ data: status() })
    global.fetch = jest.fn()
  })

  test('mode off shows the three groups, the rates and the 90% warning', async () => {
    render(<AutopilotSection role="manager" />)
    expect(await screen.findByRole('heading', { name: 'Tự vận hành' })).toBeInTheDocument()
    expect(screen.getByText('Đang tắt')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tự chạy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Có thể mở thêm' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Luôn cần người' })).toBeInTheDocument()
    expect(screen.getByText(/Khớp 97% \(30 đề xuất 30 ngày\)/)).toBeInTheDocument()
    expect(screen.getByText(/Khớp 80% .*Dưới 90%/)).toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu so sánh').length).toBeGreaterThan(0)
    expect(screen.getByText('chạy ở lượt kế tiếp')).toBeInTheDocument()
    expect(screen.getByText('chờ 2 giờ để chặn')).toBeInTheDocument()
    expect(screen.getByLabelText('Duyệt thu hoạch')).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Dừng ngay' })).not.toBeInTheDocument()
  })

  test('the enable button needs the acknowledgement, then sends the opened kinds and the cap', async () => {
    render(<AutopilotSection role="manager" />)
    const button = await screen.findByRole('button', { name: 'Bật tự vận hành' })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Duyệt thu hoạch'))
    fireEvent.change(screen.getByLabelText(/Tối đa việc tự chạy/), { target: { value: '20' } })
    fireEvent.click(screen.getByLabelText(/Tôi hiểu các việc trên sẽ tự chạy dưới tên tôi/))
    expect(button).toBeEnabled()

    respond(true, 200, { data: status({ enabled: true, enabled_by_name: 'Lan', daily_cap: 20, unlocked_kinds: ['harvest.approve'] }) })
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('Đang bật')).toBeInTheDocument())
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/agent/autopilot/enable')
    expect(JSON.parse(init.body)).toEqual({ unlocked_kinds: ['harvest.approve'], daily_cap: 20, acknowledged: true })
    expect(screen.getByRole('button', { name: 'Dừng ngay' })).toBeInTheDocument()
    expect(screen.getByText('Đã mở thêm: Duyệt thu hoạch.')).toBeInTheDocument()
  })

  test('without a fresh sign-in the button says so and sends the person through sign-in', async () => {
    render(<AutopilotSection role="manager" reauthNeeded />)
    const button = await screen.findByRole('button', { name: 'Đăng nhập lại để bật' })
    fireEvent.click(screen.getByLabelText(/Tôi hiểu các việc trên/))
    fireEvent.click(button)
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith('keycloak', { callbackUrl: '/manager/ai/settings' }, { prompt: 'login' })
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('a REAUTH_REQUIRED answer turns the button into the sign-in button', async () => {
    render(<AutopilotSection role="manager" />)
    fireEvent.click(await screen.findByLabelText(/Tôi hiểu các việc trên/))
    respond(false, 401, { error: { code: 'REAUTH_REQUIRED', message: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bật tự vận hành' }))
    expect(await screen.findByRole('button', { name: 'Đăng nhập lại để bật' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('đăng nhập lại')
  })

  test('mode on shows the status, today\'s counts and a Dừng ngay button that stops it', async () => {
    fetchJsonMock.mockResolvedValue({
      data: status({ enabled: true, enabled_by_name: 'Lan', daily_cap: 30, today: { ran: 4, blocked: 1, pending: 2 } }),
    })
    render(<AutopilotSection role="manager" />)
    expect(await screen.findByText('Đang bật')).toBeInTheDocument()
    expect(screen.getByText('4/30')).toBeInTheDocument()
    expect(screen.getByText('Đã tự chạy hôm nay')).toBeInTheDocument()
    expect(screen.getByText(/Bật bởi Lan/)).toBeInTheDocument()

    respond(true, 200, { data: status({ stop_reason: 'manual' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Dừng ngay' }))
    await waitFor(() => expect(screen.getByText('Đang tắt')).toBeInTheDocument())
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/agent/autopilot/stop')
    expect(screen.getByText(/Đã dừng theo yêu cầu/)).toBeInTheDocument()
  })

  test('an officer sees the status and Dừng ngay only', async () => {
    fetchJsonMock.mockResolvedValue({ data: status({ enabled: true, can_enable: false, enabled_by_name: 'Lan' }) })
    render(<AutopilotSection role="officer" />)
    expect(await screen.findByRole('button', { name: 'Dừng ngay' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  test('an officer with the mode off sees no enable controls and no stop button', async () => {
    fetchJsonMock.mockResolvedValue({ data: status({ can_enable: false }) })
    render(<AutopilotSection role="officer" />)
    expect(await screen.findByText(/Chỉ trưởng HTX được bật tự vận hành/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  test('a brake reason is shown after a stop', async () => {
    fetchJsonMock.mockResolvedValue({ data: status({ stop_reason: 'brake_failures' }) })
    render(<AutopilotSection role="manager" />)
    expect(await screen.findByText(/Đã dừng \(phanh\): có 3 việc tự chạy bị lỗi/)).toBeInTheDocument()
  })

  test('a cap outside 1 to 50 is refused before anything is sent', async () => {
    render(<AutopilotSection role="manager" />)
    fireEvent.click(await screen.findByLabelText(/Tôi hiểu các việc trên/))
    fireEvent.change(screen.getByLabelText(/Tối đa việc tự chạy/), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bật tự vận hành' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('từ 1 đến 50')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('a load failure shows the standard message', async () => {
    fetchJsonMock.mockRejectedValue(new Error('x'))
    render(<AutopilotSection role="manager" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  })
})
