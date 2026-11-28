// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemberList } from '@/app/manager/members/_components/member-list'
import '@testing-library/jest-dom'

jest.mock('focus-trap-react', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const members = [
  { id: 'm1', full_name: 'Giám đốc An', phone: '0900000001', email: 'm1', role: 'manager', roles: ['manager'], status: 'ACTIVE' },
  { id: 'u1', full_name: 'Hùng Nhiều Vai', phone: '0900000002', email: 'u1', role: 'officer', roles: ['officer', 'farmer'], status: 'ACTIVE' },
]

let fetchMock: jest.Mock
beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/members') return { ok: true, json: async () => ({ data: members }) }
    if (url.startsWith('/api/farm/households')) return { ok: true, json: async () => ({ data: [] }) }
    return { ok: true, json: async () => ({ data: {} }), init }
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const open = async () => {
  await act(async () => {
    render(<MemberList />)
  })
  await screen.findByText('Hùng Nhiều Vai')
}

describe('members with several roles', () => {
  test('the roles column shows every role of a person', async () => {
    await open()
    const row = screen.getByText('Hùng Nhiều Vai').closest('tr')!
    expect(within(row).getByText('Cán bộ kỹ thuật')).toBeInTheDocument()
    expect(within(row).getByText('Nông dân')).toBeInTheDocument()
    expect(within(screen.getByText('Giám đốc An').closest('tr')!).getByText('Trưởng HTX')).toBeInTheDocument()
  })

  test('a manager row has no delete button', async () => {
    await open()
    expect(within(screen.getByText('Giám đốc An').closest('tr')!).queryByText('Xóa')).toBeNull()
  })

  test('"Sửa vai" opens the dialog with the current roles ticked, and saves with PUT', async () => {
    await open()
    fireEvent.click(within(screen.getByText('Hùng Nhiều Vai').closest('tr')!).getByText('Sửa vai'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Cán bộ kỹ thuật')).toBeChecked()
    expect(within(dialog).getByLabelText('Nông dân')).toBeChecked()
    expect(within(dialog).getByLabelText('Kế toán')).not.toBeChecked()
    fireEvent.click(within(dialog).getByLabelText('Kế toán'))
    fireEvent.click(within(dialog).getByLabelText('Nông dân'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/members/u1/roles')!
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body).roles.sort()).toEqual(['accountant', 'officer'])
  })

  test('unticking every role of a non-manager shows a validation error and does not call the server', async () => {
    await open()
    fireEvent.click(within(screen.getByText('Hùng Nhiều Vai').closest('tr')!).getByText('Sửa vai'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText('Cán bộ kỹ thuật'))
    fireEvent.click(within(dialog).getByLabelText('Nông dân'))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Chọn ít nhất một vai')
    expect(within(dialog).getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  test('a server error is shown in the dialog', async () => {
    await open()
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/members' ? { ok: true, json: async () => ({ data: members }) }
        : url.endsWith('/roles') ? { ok: false, json: async () => ({ error: { message: 'Không thể sửa vai của Trưởng HTX khác' } }) }
        : { ok: true, json: async () => ({ data: [] }) })
    fireEvent.click(within(screen.getByText('Hùng Nhiều Vai').closest('tr')!).getByText('Sửa vai'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText('Kế toán'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể sửa vai của Trưởng HTX khác')
  })

  test('the invitation can carry several roles', async () => {
    await open()
    fireEvent.click(screen.getByText('Thêm thành viên'))
    fireEvent.click(screen.getByLabelText('Kế toán'))
    fireEvent.change(screen.getByPlaceholderText('VD: Nguyễn Văn A'), { target: { value: 'Trần Văn B' } })
    fireEvent.change(screen.getByPlaceholderText('VD: 0912345678'), { target: { value: '0912345678' } })
    fireEvent.change(screen.getByPlaceholderText('Ít nhất 6 ký tự'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Tạo tài khoản/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/members/invite')).toBe(true))
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/members/invite')![1].body)
    expect(body.roles.sort()).toEqual(['accountant', 'farmer'])
  })
})
