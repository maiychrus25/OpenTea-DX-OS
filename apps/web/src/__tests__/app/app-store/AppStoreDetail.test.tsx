// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AppStoreDetail } from '@/app/manager/app-store/_components/AppStoreDetail'
import type { StoreAppDetail } from '@/domain/entities/app-store'

const detail = (over: Partial<StoreAppDetail> = {}): StoreAppDetail => ({
  id: 'tea-shop',
  name: 'Cửa hàng chè',
  version: '1.2.0',
  description: 'Bán chè',
  license: 'MIT',
  publisher: 'OpenTea Developers',
  roles: ['manager', 'officer'],
  hasPublic: false,
  status: 'available',
  error: null,
  category: 'sales',
  icon: 'shopping-bag',
  installedOnServer: false,
  phase: null,
  openHref: null,
  about: [],
  menu: [],
  data: [],
  personalData: null,
  coreReads: [],
  requiresCore: '',
  hasDatabase: false,
  publicUrl: null,
  preview: ['Lần cài đầu trên máy chủ phải dựng ứng dụng, mất vài phút'],
  screenshots: [],
  history: [],
  ...over,
})
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

const view = (over: Partial<StoreAppDetail> = {}, workerAlive = true) => render(<AppStoreDetail initial={detail(over)} workerAlive={workerAlive} />)

describe('AppStoreDetail', () => {
  test('the header shows the name, back link, version, publisher, license, category and status', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Cửa hàng chè' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Kho ứng dụng' })).toHaveAttribute('href', '/manager/app-store')
    expect(screen.getByText('v1.2.0 · OpenTea Developers · MIT · Bán hàng')).toBeInTheDocument()
    expect(screen.getByText('Chưa cài')).toBeInTheDocument()
  })

  test('renders manifest text as plain text', () => {
    const { container } = view({
      about: ['<script>alert(1)</script>', '**bold** and [link](http://x)'],
      data: ['<b>đơn hàng</b>'],
      personalData: '<img src=x onerror=alert(1)>',
      coreReads: ['<i>x</i>'],
      screenshots: [{ position: 0, caption: '<script>c</script>', url: '/api/app-store/apps/tea-shop/screenshots/0' }],
      preview: ['<script>p</script>'],
    })
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(screen.getByText('**bold** and [link](http://x)')).toBeInTheDocument()
    expect(screen.getByText('<b>đơn hàng</b>')).toBeInTheDocument()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('script, b, i, strong')).toBeNull()
    expect(container.querySelector('img[onerror]')).toBeNull()
  })

  test('lists what installing does', () => {
    view({ preview: ['Thêm mục "Cửa hàng" cho Trưởng HTX', 'Tạo kho dữ liệu riêng'] })
    const section = screen.getByRole('heading', { name: 'Khi cài, ứng dụng sẽ' }).closest('section')!
    expect(within(section).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Thêm mục "Cửa hàng" cho Trưởng HTX', 'Tạo kho dữ liệu riêng'])
  })

  test('sections with nothing to show are not rendered', () => {
    view()
    for (const heading of ['Ảnh màn hình', 'Giới thiệu', 'Dữ liệu', 'Lịch sử của ứng dụng này']) {
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Yêu cầu phiên bản lõi')).not.toBeInTheDocument()
    expect(screen.queryByText('Trang công khai')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thông tin' })).toBeInTheDocument()
  })

  test('the data section shows each declared part with the note', () => {
    view({ data: ['đơn hàng'], personalData: 'tên khách', coreReads: ['danh sách xã viên'] })
    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeInTheDocument()
    for (const text of ['Ứng dụng lưu', 'Dữ liệu cá nhân', 'Đọc từ hệ thống', 'đơn hàng', 'tên khách', 'danh sách xã viên']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByText('Theo khai báo của nhà phát hành. Gỡ ứng dụng vẫn giữ dữ liệu.')).toBeInTheDocument()
  })

  test('only the declared data parts get a sub-label', () => {
    view({ data: ['đơn hàng'] })
    expect(screen.getByText('Ứng dụng lưu')).toBeInTheDocument()
    expect(screen.queryByText('Dữ liệu cá nhân')).not.toBeInTheDocument()
    expect(screen.queryByText('Đọc từ hệ thống')).not.toBeInTheDocument()
  })

  test('the info section shows the core requirement when declared', () => {
    view({ requiresCore: '>=1.10.0' })
    expect(screen.getByText('Yêu cầu phiên bản lõi')).toBeInTheDocument()
    expect(screen.getByText('>=1.10.0')).toBeInTheDocument()
  })

  test('about is one paragraph per entry', () => {
    view({ about: ['Một.', 'Hai.'] })
    const section = screen.getByRole('heading', { name: 'Giới thiệu' }).closest('section')!
    expect(within(section).getAllByText(/\./).map(p => p.tagName)).toEqual(['P', 'P'])
  })

  test('screenshots are lazy images with their caption as alt text', () => {
    view({ screenshots: [{ position: 0, caption: 'Trang chủ', url: '/api/app-store/apps/tea-shop/screenshots/0' }, { position: 1, caption: 'Giỏ hàng', url: '/api/app-store/apps/tea-shop/screenshots/1' }] })
    const img = screen.getByAltText('Trang chủ')
    expect(img).toHaveAttribute('src', '/api/app-store/apps/tea-shop/screenshots/0')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getByAltText('Giỏ hàng')).toBeInTheDocument()
  })

  test('Mở ứng dụng links to the first manager page once installed', () => {
    view({ status: 'enabled', openHref: '/manager/apps/tea-shop' })
    expect(screen.getByRole('link', { name: 'Mở ứng dụng' })).toHaveAttribute('href', '/manager/apps/tea-shop')
  })

  test('an installed app with no manager page says who it is for', () => {
    view({ status: 'enabled_all', openHref: null, roles: ['officer', 'farmer'] })
    expect(screen.queryByRole('link', { name: 'Mở ứng dụng' })).not.toBeInTheDocument()
    expect(screen.getByText('Ứng dụng này dành cho Cán bộ, Nông dân.')).toBeInTheDocument()
  })

  test('neither shows before the app is installed', () => {
    view({ status: 'available', openHref: null })
    expect(screen.queryByRole('link', { name: 'Mở ứng dụng' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Ứng dụng này dành cho/)).not.toBeInTheDocument()
  })

  test('the public URL shows only when the server gives one, with a copy button', () => {
    const { unmount } = view({ status: 'enabled', hasPublic: true, publicUrl: '/apps/tea-shop/public/TC' })
    expect(screen.getByText('Trang công khai')).toBeInTheDocument()
    expect(screen.getByText('/apps/tea-shop/public/TC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeInTheDocument()
    unmount()
    view({ status: 'available', hasPublic: true, publicUrl: null })
    expect(screen.queryByText('Trang công khai')).not.toBeInTheDocument()
  })

  test('shows the progress only while work is open or after a failure', () => {
    const { unmount } = view({ status: 'installing', phase: 'build' })
    expect(screen.getByText('Dựng và khởi động').closest('li')).toHaveAttribute('aria-current', 'step')
    unmount()
    view({ status: 'enabled' })
    expect(screen.queryByText('Đã gửi yêu cầu')).not.toBeInTheDocument()
  })

  test('shows the history of the app', () => {
    view({
      history: [{ id: 'r1', appId: 'tea-shop', appName: 'Cửa hàng chè', action: 'ENABLE', status: 'DONE', requestedByName: 'An', createdAt: '2026-11-13T01:30:00.000Z', finishedAt: null, error: null }],
    })
    const section = screen.getByRole('heading', { name: 'Lịch sử của ứng dụng này' }).closest('section')!
    expect(within(section).getByRole('table')).toBeInTheDocument()
    expect(within(section).getByText('An')).toBeInTheDocument()
  })

  test('Cài posts ENABLE and the page turns to installing', async () => {
    fetchMock.mockImplementation(() => reply({ data: { status: 'installing' } }, 202))
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Cài' }))
    expect(await screen.findByText('Đang chờ trình cài đặt')).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ appId: 'tea-shop', action: 'ENABLE' })
  })

  test('Thử lại shows on a failed app and Gỡ asks first', async () => {
    const { unmount } = view({ status: 'failed', error: 'x' })
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    unmount()
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    view({ status: 'enabled' })
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }))
    expect(confirm).toHaveBeenCalledWith('Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.')
    expect(fetchMock).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  test('a refused request shows its message', async () => {
    fetchMock.mockImplementation(() => reply({ error: { code: 'REQUEST_OPEN', message: 'Ứng dụng này đang được xử lý. Vui lòng đợi.' } }, 409))
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Cài' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ứng dụng này đang được xử lý. Vui lòng đợi.')
  })

  describe('polling', () => {
    beforeEach(() => jest.useFakeTimers())

    test('polls this app every 3 s while installing, stops when done and refreshes the menu once', async () => {
      fetchMock
        .mockImplementationOnce(() => reply({ data: detail({ status: 'installing', phase: 'build' }) }))
        .mockImplementation(() => reply({ data: detail({ status: 'enabled' }) }))
      view({ status: 'installing' })
      expect(fetchMock).not.toHaveBeenCalled()
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(fetchMock.mock.calls[0][0]).toBe('/api/app-store/apps/tea-shop')
      expect(screen.getByText('Dựng và khởi động').closest('li')).toHaveAttribute('aria-current', 'step')
      expect(refresh).not.toHaveBeenCalled()
      await act(async () => {
        jest.advanceTimersByTime(3000)
      })
      expect(screen.getByText('Đã cài')).toBeInTheDocument()
      expect(refresh).toHaveBeenCalledTimes(1)
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    test('does not poll when nothing is in progress', async () => {
      view({ status: 'enabled' })
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
    })
  })
})
