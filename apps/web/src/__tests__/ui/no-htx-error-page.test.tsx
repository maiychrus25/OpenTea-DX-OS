// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerError from '@/app/manager/error'
import OfficerError from '@/app/officer/error'
import FarmerError from '@/app/farmer/error'
import ManagerDashboardError from '@/app/manager/dashboard/error'

const noHtx = Object.assign(new Error('An error occurred in the Server Components render'), { digest: 'NO_HTX' })
const other = Object.assign(new Error('boom'), { digest: '12345' })

describe.each([
  ['manager', ManagerError],
  ['officer', OfficerError],
  ['farmer', FarmerError],
  ['manager dashboard', ManagerDashboardError],
])('%s error page', (_name, Page) => {
  test('tells the user the account has no HTX', () => {
    render(<Page error={noHtx} reset={jest.fn()} />)
    expect(screen.getByText('Tài khoản chưa được gán Hợp tác xã')).toBeInTheDocument()
  })

  test('keeps the generic message for other errors', () => {
    render(<Page error={other} reset={jest.fn()} />)
    expect(screen.queryByText('Tài khoản chưa được gán Hợp tác xã')).not.toBeInTheDocument()
  })
})

describe.each([
  ['manager', ManagerError],
  ['officer', OfficerError],
  ['farmer', FarmerError],
])('%s error page when the core is down', (_name, Page) => {
  const coreDown = Object.assign(new Error('An error occurred in the Server Components render'), { digest: 'CORE_UNAVAILABLE' })

  test('says in Vietnamese that the service is unavailable', () => {
    render(<Page error={coreDown} reset={jest.fn()} />)
    expect(screen.getByText('Dịch vụ dữ liệu đang tạm gián đoạn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})
