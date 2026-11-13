// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AppStoreClient, type AppStoreData } from '@/app/manager/app-store/_components/AppStoreClient'
import type { AppStoreStatus, StoreApp } from '@/domain/entities/app-store'

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
  phase: null,
  openHref: null,
})
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
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryAllByRole('button').map(b => b.textContent)).toEqual(buttons)
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
    expect(screen.getByText('Đã cài')).toBeInTheDocument()
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
    expect(screen.getByText('Chưa cài')).toBeInTheDocument()
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
      expect(screen.getByText('Đã cài')).toBeInTheDocument()

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
      expect(screen.getByText('Chưa cài')).toBeInTheDocument()
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
