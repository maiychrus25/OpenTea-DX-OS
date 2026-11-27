// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { RoleSwitcher } from '@/components/layout/RoleSwitcher/RoleSwitcher'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const fetchMock = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('RoleSwitcher', () => {
  test('is hidden for an account with one role', () => {
    const { container } = render(<RoleSwitcher roles={['manager']} active="manager" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('lists the roles and marks the active one with aria-current', () => {
    render(<RoleSwitcher roles={['manager', 'officer', 'accountant']} active="manager" />)
    expect(screen.getByRole('button', { name: /Trưởng HTX/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /Cán bộ KT/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: /Kế toán/ })).toBeInTheDocument()
  })

  test('switches: posts the role, then opens the home it returns', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { role: 'officer', home: '/officer/dashboard' } }) })
    render(<RoleSwitcher roles={['manager', 'officer']} active="manager" />)
    fireEvent.click(screen.getByRole('button', { name: /Cán bộ KT/ }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/officer/dashboard'))
    expect(refresh).toHaveBeenCalled()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: 'officer' })
  })

  test('is disabled while the request is pending', async () => {
    let finish: (value: unknown) => void = () => undefined
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<RoleSwitcher roles={['manager', 'officer']} active="manager" />)
    fireEvent.click(screen.getByRole('button', { name: /Cán bộ KT/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Cán bộ KT/ })).toBeDisabled())
    expect(screen.getByRole('button', { name: /Trưởng HTX/ })).toBeDisabled()
    finish({ ok: false })
    await waitFor(() => expect(screen.getByRole('button', { name: /Cán bộ KT/ })).toBeEnabled())
  })

  test('shows an error toast and stays on the page when the server refuses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    render(<RoleSwitcher roles={['manager', 'officer']} active="manager" />)
    fireEvent.click(screen.getByRole('button', { name: /Cán bộ KT/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không chuyển được vai. Vui lòng thử lại.'))
    expect(replace).not.toHaveBeenCalled()
  })
})
