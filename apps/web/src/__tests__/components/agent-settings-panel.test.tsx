// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AgentSettingsPanel } from '@/components/features/agent/AgentSettingsPanel'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchJsonMock = jest.fn()
jest.mock('@/lib/api/fetch-json', () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
  LOAD_FAILED_MESSAGE: 'Không thể tải dữ liệu. Vui lòng thử lại sau.',
}))

function settingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    agents: {
      'journal-review': { enabled: true, provider: 'ollama', model: null },
      digest: { enabled: false, provider: 'ollama', model: null },
      bulletin: { enabled: false, provider: 'ollama', model: null },
      assistant: { enabled: false, provider: 'ollama', model: null },
      'daily-campaign': { enabled: false, provider: 'ollama', model: null },
    },
    report_time: '18:00',
    budget: { monthly_limit_usd: 10, spent_usd: 8.2, month: '2026-11', exhausted: false },
    providers: ['ollama', 'anthropic'],
    can_edit: true,
    ...overrides,
  }
}

describe('AgentSettingsPanel (settings tab)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchJsonMock.mockResolvedValue({ data: settingsResponse() })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: settingsResponse() }),
    }) as unknown as typeof fetch
  })

  test('a manager sees only the providers the agent reported, and the month spend', async () => {
    render(<AgentSettingsPanel role="manager" />)
    const select = (await screen.findAllByLabelText(/Nhà cung cấp mô hình/i))[0] as HTMLSelectElement
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Ollama (máy chủ HTX)', 'Claude (Anthropic)'])
    expect(screen.getByText(/Đã dùng tháng 11\/2026: 8\.20 USD trên 10\.00 USD/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu cài đặt' })).toBeEnabled()
  })

  test('the assistant row names A7, and its external provider dialog says what leaves the server', async () => {
    render(<AgentSettingsPanel role="manager" />)
    const legend = await screen.findByText('Trợ lý Telegram (A7)')
    const select = within(legend.closest('fieldset') as HTMLElement).getByLabelText(/Nhà cung cấp mô hình/i)

    fireEvent.change(select, { target: { value: 'anthropic' } })

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Câu bạn nhắn cho trợ lý (đã che số điện thoại, e-mail và số giấy tờ). Không gửi ảnh, vị trí hay dữ liệu trả lời.'
    )
  })

  test('choosing an external provider opens the list of what leaves the server before anything changes', async () => {
    render(<AgentSettingsPanel role="manager" />)
    const select = (await screen.findAllByLabelText(/Nhà cung cấp mô hình/i))[0] as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'anthropic' } })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Số điện thoại, e-mail và số giấy tờ trong ghi chú được che; tên người viết trong ghi chú không được che')
    expect(dialog).toHaveTextContent('Anthropic')
    expect(select.value).toBe('ollama')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(select.value).toBe('ollama')
  })

  test('confirming saves the chosen provider through the settings route', async () => {
    render(<AgentSettingsPanel role="manager" />)
    const select = (await screen.findAllByLabelText(/Nhà cung cấp mô hình/i))[0] as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'anthropic' } })
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đồng ý, chọn Anthropic' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/agent/settings')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body.agents['journal-review']).toEqual({ provider: 'anthropic', model: null })
    expect(body.monthly_limit_usd).toBe(10)
    expect(body.report_time).toBe('18:00')
  })

  test('a budget that is not a positive number is refused before the request', async () => {
    render(<AgentSettingsPanel role="manager" />)
    const limit = await screen.findByLabelText(/Ngân sách của HTX/i)
    fireEvent.change(limit, { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngân sách phải là số dương')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('an officer sees the same values read-only with no way to save', async () => {
    fetchJsonMock.mockResolvedValue({ data: settingsResponse({ can_edit: false }) })
    render(<AgentSettingsPanel role="officer" />)

    expect(await screen.findByText(/chế độ chỉ đọc/)).toBeInTheDocument()
    const select = (await screen.findAllByLabelText(/Nhà cung cấp mô hình/i))[0] as HTMLSelectElement
    expect(select).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Lưu cài đặt' })).not.toBeInTheDocument()
  })

  test('a failed load shows the load message instead of a blank tab', async () => {
    fetchJsonMock.mockRejectedValue(new Error('down'))
    render(<AgentSettingsPanel role="manager" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
  })
})
