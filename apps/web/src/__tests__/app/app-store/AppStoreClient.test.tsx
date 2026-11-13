// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AppStoreClient, type AppStoreData } from '@/app/manager/app-store/_components/AppStoreClient'
import type { AppStoreStatus, StoreApp, StoreCategory } from '@/domain/entities/app-store'

const card = (id: string, status: AppStoreStatus, error: string | null = null): StoreApp => ({
  id,
  name: `App ${id}`,
  version: '1.0.0',
  description: `Mô tả ${id}`,
  license: 'MIT',
  publisher: 'OpenTea Developers',
  roles: ['manager', 'farmer'],
  hasPublic: id === 'pub',
  status,
  error,
  category: null,
  icon: null,
  installedOnServer: false,
  installedVersion: null,
  phase: null,
  openHref: null,
})
const named = (id: string, name: string, description: string, status: AppStoreStatus, category: StoreCategory | null = null): StoreApp => ({
  ...card(id, status),
  name,
  description,
  category,
})
// The filter buttons share their words with the status pills, so card assertions look inside the list.
const cards = () => within(screen.getByRole('list'))
const data = (apps: StoreApp[], workerAlive = true): AppStoreData => ({ workerAlive, apps })
// jsdom has no Response, so the tests answer with the three members the component reads.
const reply = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

let fetchMock: jest.Mock

beforeEach(() => {
  refresh.mockClear()
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => jest.useRealTimers())

describe('AppStoreClient', () => {
  test('a card shows Có bản mới only when the installed version differs', () => {
    const behind = { ...card('old', 'enabled'), version: '0.2.0', installedVersion: '0.1.0' }
    const current = { ...card('cur', 'enabled'), version: '0.2.0', installedVersion: '0.2.0' }
    render(<AppStoreClient initial={data([behind, current, card('none', 'available')])} />)
    expect(cards().getAllByText('Có bản mới')).toHaveLength(1)
    expect(within(screen.getByText('App old').closest('li')!).getByText('Có bản mới')).toBeInTheDocument()
  })

  test('a card shows no Có bản mới to an HTX that does not use the app', () => {
    const elsewhere = { ...card('far', 'available'), version: '0.2.0', installedVersion: '0.1.0' }
    const all = { ...card('all', 'enabled_all'), version: '0.2.0', installedVersion: '0.1.0' }
    render(<AppStoreClient initial={data([elsewhere, all])} />)
    expect(within(screen.getByText('App far').closest('li')!).queryByText('Có bản mới')).toBeNull()
    expect(within(screen.getByText('App all').closest('li')!).getByText('Có bản mới')).toBeInTheDocument()
  })

  test('shows the card text and the empty state', () => {
    const { unmount } = render(<AppStoreClient initial={data([card('pub', 'available')])} />)
    expect(screen.getByRole('heading', { name: 'Kho ứng dụng' })).toBeInTheDocument()
    expect(screen.getByText('App pub')).toBeInTheDocument()
    expect(screen.getByText('Mô tả pub')).toBeInTheDocument()
    expect(screen.getByText(/Dành cho Trưởng HTX, Nông dân/)).toBeInTheDocument()
    expect(screen.getByText(/Có trang công khai/)).toBeInTheDocument()
    unmount()
    render(<AppStoreClient initial={data([])} />)
    expect(screen.getByText('Kho chưa có ứng dụng nào.')).toBeInTheDocument()
  })

  test.each([
    ['available', 'Chưa cài', ['Cài']],
    ['installing', 'Đang cài…', []],
    ['enabled', 'Đã cài', ['Gỡ']],
    ['removing', 'Đang gỡ…', []],
    ['enabled_all', 'Đã cài cho mọi HTX (quản trị máy chủ)', []],
    ['failed', 'Lỗi', ['Thử lại']],
  ] as const)('%s: label %s and buttons %j', (status, label, buttons) => {
    fetchMock.mockImplementation(() => reply({ data: data([card('a', status)]) }))
    render(<AppStoreClient initial={data([card('a', status, status === 'failed' ? 'Cài đặt hỏng' : null)])} />)
    expect(cards().getByText(label)).toBeInTheDocument()
    expect(cards().queryAllByRole('button').map(b => b.textContent)).toEqual(buttons)
  })

  test('a failed card shows its error in an alert', () => {
    render(<AppStoreClient initial={data([card('a', 'failed', 'Cài đặt hỏng (mã 1).')])} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cài đặt hỏng (mã 1).')
  })

  test('warns when the worker is not running, and only then', () => {
    const { unmount } = render(<AppStoreClient initial={data([card('a', 'available')], false)} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật ./dxos worker.',
    )
    unmount()
    render(<AppStoreClient initial={data([card('a', 'available')])} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('Cài posts ENABLE and the card turns to installing', async () => {
    fetchMock.mockImplementation(() => reply({ data: { status: 'installing' } }, 202))
    render(<AppStoreClient initial={data([card('hello', 'available')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cài' }))
    await waitFor(() => expect(screen.getByText('Đang cài…')).toBeInTheDocument())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/app-store/requests')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ appId: 'hello', action: 'ENABLE' })
    expect(screen.queryByRole('button', { name: 'Cài' })).not.toBeInTheDocument()
  })

  test('Thử lại posts ENABLE again', async () => {
    fetchMock.mockImplementation(() => reply({ data: { status: 'installing' } }, 202))
    render(<AppStoreClient initial={data([card('hello', 'failed', 'x')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(screen.getByText('Đang cài…')).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ appId: 'hello', action: 'ENABLE' })
  })

  test('Gỡ asks first and posts nothing when declined', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AppStoreClient initial={data([card('hello', 'enabled')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }))
    expect(confirm).toHaveBeenCalledWith('Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cards().getByText('Đã cài')).toBeInTheDocument()
    confirm.mockRestore()
  })

  test('Gỡ posts DISABLE once confirmed', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
    fetchMock.mockImplementation(() => reply({ data: { status: 'removing' } }, 202))
    render(<AppStoreClient initial={data([card('hello', 'enabled')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }))
    await waitFor(() => expect(screen.getByText('Đang gỡ…')).toBeInTheDocument())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ appId: 'hello', action: 'DISABLE' })
    confirm.mockRestore()
  })

  test('shows the message of a refused request and keeps the card', async () => {
    fetchMock.mockImplementation(() => reply({ error: { code: 'REQUEST_OPEN', message: 'Ứng dụng này đang được xử lý. Vui lòng đợi.' } }, 409))
    render(<AppStoreClient initial={data([card('hello', 'available')])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cài' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ứng dụng này đang được xử lý. Vui lòng đợi.')
    expect(cards().getByText('Chưa cài')).toBeInTheDocument()
  })

  describe('search and filters', () => {
    const apps = [
      named('tea-shop', 'Cửa hàng chè', 'Bán chè trực tuyến', 'enabled', 'sales'),
      named('farm-supply', 'Vật tư mua chung', 'Đặt phân bón', 'available', 'members'),
      named('hello', 'Xin chào', 'Ứng dụng mẫu', 'failed', 'sample'),
      named('busy', 'Đang bận', 'Một việc', 'installing', 'sales'),
    ]
    const names = () => cards().getAllByRole('heading').map(h => h.textContent)

    test('search ignores case and accents, and matches the description too', () => {
      render(<AppStoreClient initial={data(apps)} />)
      fireEvent.change(screen.getByLabelText('Tìm ứng dụng'), { target: { value: 'che' } })
      expect(names()).toEqual(['Cửa hàng chè'])
      fireEvent.change(screen.getByLabelText('Tìm ứng dụng'), { target: { value: 'vat tu' } })
      expect(names()).toEqual(['Vật tư mua chung'])
      fireEvent.change(screen.getByLabelText('Tìm ứng dụng'), { target: { value: 'DAT PHAN' } })
      expect(names()).toEqual(['Vật tư mua chung'])
      fireEvent.change(screen.getByLabelText('Tìm ứng dụng'), { target: { value: 'dang ban' } })
      expect(names()).toEqual(['Đang bận'])
    })

    test('the search box also carries the placeholder', () => {
      render(<AppStoreClient initial={data(apps)} />)
      expect(screen.getByPlaceholderText('Tìm ứng dụng')).toBeInTheDocument()
    })

    test('only categories that have an app get a button, labelled in Vietnamese', () => {
      render(<AppStoreClient initial={data(apps)} />)
      for (const label of ['Bán hàng', 'Thành viên và vật tư', 'Ứng dụng mẫu']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
      for (const label of ['Sản xuất và thu mua', 'Du lịch']) expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    })

    test('a category button filters, carries aria-pressed and toggles off', () => {
      render(<AppStoreClient initial={data(apps)} />)
      const sales = screen.getByRole('button', { name: 'Bán hàng' })
      expect(sales).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(sales)
      expect(sales).toHaveAttribute('aria-pressed', 'true')
      expect(names()).toEqual(['Cửa hàng chè', 'Đang bận'])
      fireEvent.click(sales)
      expect(names()).toHaveLength(4)
    })

    test('Đã cài is enabled, enabled_all and removing; Chưa cài is available, installing and failed', () => {
      const all = [
        named('a', 'A', '', 'enabled'),
        named('b', 'B', '', 'enabled_all'),
        named('c', 'C', '', 'removing'),
        named('d', 'D', '', 'available'),
        named('e', 'E', '', 'installing'),
        named('f', 'F', '', 'failed'),
      ]
      render(<AppStoreClient initial={data(all)} />)
      const installed = screen.getByRole('button', { name: 'Đã cài' })
      const notInstalled = screen.getByRole('button', { name: 'Chưa cài' })
      expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(installed)
      expect(installed).toHaveAttribute('aria-pressed', 'true')
      expect(names()).toEqual(['A', 'B', 'C'])
      fireEvent.click(notInstalled)
      expect(names()).toEqual(['D', 'E', 'F'])
      fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
      expect(names()).toHaveLength(6)
    })

    test('filters combine and an empty result says so', () => {
      render(<AppStoreClient initial={data(apps)} />)
      fireEvent.click(screen.getByRole('button', { name: 'Bán hàng' }))
      fireEvent.click(screen.getByRole('button', { name: 'Chưa cài' }))
      expect(names()).toEqual(['Đang bận'])
      fireEvent.change(screen.getByLabelText('Tìm ứng dụng'), { target: { value: 'zzz' } })
      expect(screen.getByText('Không có ứng dụng nào khớp bộ lọc.')).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    test('the name of a card links to its detail page and the action stays on the card', () => {
      render(<AppStoreClient initial={data(apps)} />)
      expect(screen.getByRole('link', { name: 'Cửa hàng chè' })).toHaveAttribute('href', '/manager/app-store/tea-shop')
      expect(within(screen.getByRole('link', { name: 'Vật tư mua chung' }).closest('li')!).getByRole('button', { name: 'Cài' })).toBeInTheDocument()
    })

    test('an icon outside the allowlist falls back to the default one', () => {
      const { container } = render(<AppStoreClient initial={data([{ ...card('a', 'available'), icon: '<svg onload=1>' }, { ...card('b', 'available'), icon: 'leaf' }])} />)
      expect(container.querySelectorAll('li svg')).toHaveLength(2)
      expect(container.querySelector('li svg.lucide-layout-grid')).not.toBeNull()
      expect(container.querySelector('li svg.lucide-leaf')).not.toBeNull()
    })
  })

  describe('tabs and history', () => {
    test('Lịch sử loads the history once, on first open', async () => {
      fetchMock.mockImplementation(() => reply({ data: [] }))
      render(<AppStoreClient initial={data([card('a', 'available')])} />)
      expect(screen.getByRole('tab', { name: 'Ứng dụng' })).toHaveAttribute('aria-selected', 'true')
      expect(fetchMock).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử' }))
      expect(await screen.findByText('Chưa có yêu cầu cài hoặc gỡ nào.')).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe('/api/app-store/history')
      fireEvent.click(screen.getByRole('tab', { name: 'Ứng dụng' }))
      fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử' }))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('polling', () => {
    beforeEach(() => jest.useFakeTimers())

    test('polls every 3 s while an app installs and stops once it is done', async () => {
      fetchMock
        .mockImplementationOnce(() => reply({ data: data([card('hello', 'installing')]) }))
        .mockImplementation(() => reply({ data: data([card('hello', 'enabled')]) }))
      render(<AppStoreClient initial={data([card('hello', 'installing')])} />)
      expect(fetchMock).not.toHaveBeenCalled()

      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe('/api/app-store')

      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(cards().getByText('Đã cài')).toBeInTheDocument()

      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('does not poll when nothing is in progress', async () => {
      render(<AppStoreClient initial={data([card('a', 'available'), card('b', 'enabled'), card('c', 'failed', 'x')])} />)
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('polls while an app is being removed', async () => {
      fetchMock.mockImplementation(() => reply({ data: data([card('hello', 'removing')]) }))
      render(<AppStoreClient initial={data([card('hello', 'removing')])} />)
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('refreshes the server layout once when an install ends, not while it runs', async () => {
      fetchMock
        .mockImplementationOnce(() => reply({ data: data([card('hello', 'installing')]) }))
        .mockImplementation(() => reply({ data: data([card('hello', 'enabled')]) }))
      render(<AppStoreClient initial={data([card('hello', 'installing')])} />)
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(refresh).not.toHaveBeenCalled()
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(refresh).toHaveBeenCalledTimes(1)
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    test('refreshes once when a removal ends as available', async () => {
      fetchMock.mockImplementation(() => reply({ data: data([card('hello', 'available')]) }))
      render(<AppStoreClient initial={data([card('hello', 'removing')])} />)
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(cards().getByText('Chưa cài')).toBeInTheDocument()
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    test('never refreshes a page that had nothing in progress', async () => {
      render(<AppStoreClient initial={data([card('a', 'available'), card('b', 'enabled')])} />)
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(refresh).not.toHaveBeenCalled()
    })
  })
})
