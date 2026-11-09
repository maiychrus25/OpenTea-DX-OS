// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerLotsPage from '@/app/manager/lots/page'
import { HouseholdManager } from '@/app/officer/households/_components/HouseholdManager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const answer = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }) as unknown as typeof fetch

const down = { error: { code: 'CORE_UNAVAILABLE', message: 'Dịch vụ dữ liệu đang tạm gián đoạn. Vui lòng thử lại sau.' } }

describe('list pages when the core is down', () => {
  test('the lots page says the lots could not be loaded instead of listing none', async () => {
    global.fetch = answer(503, down)
    render(<ManagerLotsPage />)
    expect(await screen.findByText('Không thể tải danh sách lô hàng.')).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy lô hàng nào.')).not.toBeInTheDocument()
  })

  test('the households page says the households could not be loaded instead of listing none', async () => {
    global.fetch = answer(503, down)
    render(<HouseholdManager />)
    expect(await screen.findByText('Không thể tải danh sách nông hộ. Vui lòng thử lại sau.')).toBeInTheDocument()
    expect(screen.queryByText(/Chưa có nông hộ nào/)).not.toBeInTheDocument()
  })

  test('the households page still shows its empty state when there are none', async () => {
    global.fetch = answer(200, { data: [] })
    render(<HouseholdManager />)
    expect(await screen.findByText(/Chưa có nông hộ nào/)).toBeInTheDocument()
  })
})
