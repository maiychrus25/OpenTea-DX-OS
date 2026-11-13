// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { InstallProgress } from '@/app/manager/app-store/_components/InstallProgress'

type Props = Parameters<typeof InstallProgress>[0]
const props = (over: Partial<Props>): Props => ({ status: 'installing', phase: null, installedOnServer: false, error: null, workerAlive: true, ...over })
const STEPS = ['Đã gửi yêu cầu', 'Chuẩn bị', 'Dựng và khởi động', 'Đăng ký']

describe('InstallProgress', () => {
  test.each(['available', 'enabled', 'enabled_all'] as const)('renders nothing for %s', status => {
    const { container } = render(<InstallProgress {...props({ status })} />)
    expect(container).toBeEmptyDOMElement()
  })

  test.each([
    ['prepare', 'Chuẩn bị'],
    ['build', 'Dựng và khởi động'],
    ['register', 'Đăng ký'],
  ] as const)('installing in the %s phase marks that step with aria-current and the earlier ones done', (phase, active) => {
    render(<InstallProgress {...props({ phase })} />)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual(expect.arrayContaining(STEPS.map(step => expect.stringContaining(step))))
    const current = items.filter(item => item.getAttribute('aria-current') === 'step')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent(active)
    const index = items.indexOf(current[0])
    items.forEach((item, i) => expect(item).toHaveAttribute('data-state', i < index ? 'done' : i === index ? 'active' : 'todo'))
  })

  test('installing without a phase on a server that has the app shows the single line', () => {
    render(<InstallProgress {...props({ installedOnServer: true })} />)
    expect(screen.getByText('Đang bật cho HTX…')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('installing without a phase otherwise waits for the installer, and warns when no worker runs', () => {
    const { rerender } = render(<InstallProgress {...props({})} />)
    expect(screen.getByText('Đang chờ trình cài đặt')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<InstallProgress {...props({ workerAlive: false })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật ./dxos worker.')
  })

  test('removing shows one line', () => {
    render(<InstallProgress {...props({ status: 'removing' })} />)
    expect(screen.getByText('Đang gỡ khỏi HTX…')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test.each([
    ['prepare', 'Chuẩn bị', 'Ứng dụng không qua được bước kiểm tra hoặc tạo kho dữ liệu. Quản trị máy chủ xem nhật ký của ./dxos worker.'],
    ['build', 'Dựng và khởi động', 'Ứng dụng không dựng hoặc không khởi động được. Quản trị máy chủ kiểm tra Docker và nhật ký của ./dxos worker.'],
    ['register', 'Đăng ký', 'Ứng dụng đã chạy nhưng chưa đăng ký được vào cổng. Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.'],
  ] as const)('failed in %s marks the step and gives the guidance', (phase, step, guidance) => {
    render(<InstallProgress {...props({ status: 'failed', phase, error: 'Cài đặt hỏng (mã 1).' })} />)
    const failed = within(screen.getByRole('list')).getAllByRole('listitem').filter(item => item.getAttribute('data-state') === 'failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toHaveTextContent(step)
    expect(failed[0]).toHaveTextContent('Lỗi')
    expect(screen.getByRole('alert')).toHaveTextContent('Cài đặt hỏng (mã 1).')
    expect(screen.getByRole('alert')).toHaveTextContent(guidance)
  })

  test('failed without a phase shows no steps, only the error and the generic guidance', () => {
    render(<InstallProgress {...props({ status: 'failed', error: 'x' })} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.')
  })
})
