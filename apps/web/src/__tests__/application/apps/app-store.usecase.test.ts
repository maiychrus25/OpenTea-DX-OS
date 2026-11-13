/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppStoreUseCase, appStatus } from '@/application/apps/app-store.usecase'
import { AppStoreError, type AppStoreRepository, type AppStoreSnapshot } from '@/domain/entities/app-store'

const catalogApp = (id: string) => ({
  id,
  name: id.toUpperCase(),
  version: '1.0.0',
  description: 'mô tả',
  license: 'MIT',
  publisher: 'OpenTea Developers',
  roles: ['manager'],
  hasPublic: false,
  menu: [] as { label: string; path: string; roles: string[] }[],
  hasDatabase: false,
  requiresCore: null as string | null,
  installedOnServer: false,
  installedVersion: null as string | null,
  store: {} as unknown,
})
const snapshot = (over: Partial<AppStoreSnapshot> = {}): AppStoreSnapshot => ({
  apps: [catalogApp('hello')],
  open: [],
  enablements: [],
  latest: [],
  ...over,
})

describe('appStatus (first match wins)', () => {
  test.each([
    ['an open ENABLE request', snapshot({ open: [{ appId: 'hello', action: 'ENABLE' }] }), 'installing'],
    ['an open DISABLE request', snapshot({ open: [{ appId: 'hello', action: 'DISABLE' }] }), 'removing'],
    ['an enablement for *', snapshot({ enablements: [{ appId: 'hello', htxCode: '*' }] }), 'enabled_all'],
    ['an enablement for the HTX', snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }] }), 'enabled'],
    ['a FAILED newest request', snapshot({ latest: [{ appId: 'hello', status: 'FAILED', error: 'x' }] }), 'failed'],
    ['a DONE newest request only', snapshot({ latest: [{ appId: 'hello', status: 'DONE', error: null }] }), 'available'],
    ['nothing', snapshot(), 'available'],
    [
      'an open request over an enablement for *',
      snapshot({ open: [{ appId: 'hello', action: 'DISABLE' }], enablements: [{ appId: 'hello', htxCode: '*' }] }),
      'removing',
    ],
    [
      '* over the HTX enablement',
      snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }, { appId: 'hello', htxCode: '*' }] }),
      'enabled_all',
    ],
    [
      'an enablement over a FAILED request',
      snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }], latest: [{ appId: 'hello', status: 'FAILED', error: 'x' }] }),
      'enabled',
    ],
    ['another app’s rows', snapshot({ open: [{ appId: 'other', action: 'ENABLE' }] }), 'available'],
  ])('%s', (_name, snap, expected) => {
    expect(appStatus('hello', snap, 'TC').status).toBe(expected)
  })

  test('failed carries the error of the request', () => {
    const snap = snapshot({ latest: [{ appId: 'hello', status: 'FAILED', error: 'Cài đặt hỏng' }] })
    expect(appStatus('hello', snap, 'TC')).toEqual({ status: 'failed', error: 'Cài đặt hỏng' })
  })
})

function setup(snap: AppStoreSnapshot = snapshot(), alive = true) {
  const repository: jest.Mocked<AppStoreRepository> = {
    snapshot: jest.fn().mockResolvedValue(snap),
    workerAlive: jest.fn().mockResolvedValue(alive),
    history: jest.fn().mockResolvedValue([]),
    screenshots: jest.fn().mockResolvedValue([]),
    screenshot: jest.fn().mockResolvedValue(null),
    createRequest: jest.fn().mockResolvedValue(undefined),
  }
  return { repository, useCase: new AppStoreUseCase(repository) }
}
const tenant = { htxCode: 'TC', userId: 'u1', userName: 'An' }
const code = async (promise: Promise<unknown>) => (await promise.catch((e: unknown) => e)) as AppStoreError

describe('AppStoreUseCase.list', () => {
  test('merges the status into every card and reports the worker', async () => {
    const { useCase, repository } = setup(
      snapshot({ apps: [catalogApp('hello'), catalogApp('tea')], enablements: [{ appId: 'tea', htxCode: 'TC' }] }),
      false,
    )
    const result = await useCase.list('TC')
    expect(repository.snapshot).toHaveBeenCalledWith('TC')
    expect(result.workerAlive).toBe(false)
    expect(result.apps.map(app => [app.id, app.status, app.error])).toEqual([['hello', 'available', null], ['tea', 'enabled', null]])
    expect(result.apps[0]).toMatchObject({ name: 'HELLO', version: '1.0.0', license: 'MIT', roles: ['manager'], hasPublic: false })
  })
})

describe('AppStoreUseCase.requestChange', () => {
  test('ENABLE queues a request for the tenant HTX and says installing', async () => {
    const { useCase, repository } = setup()
    await expect(useCase.requestChange(tenant, 'hello', 'ENABLE')).resolves.toBe('installing')
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'ENABLE', 'u1', 'An')
  })

  test('DISABLE queues a request and says removing', async () => {
    const { useCase, repository } = setup(snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }] }))
    await expect(useCase.requestChange(tenant, 'hello', 'DISABLE')).resolves.toBe('removing')
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'DISABLE', 'u1', 'An')
  })

  test('a failed app can be requested again', async () => {
    const { useCase } = setup(snapshot({ latest: [{ appId: 'hello', status: 'FAILED', error: 'x' }] }))
    await expect(useCase.requestChange(tenant, 'hello', 'ENABLE')).resolves.toBe('installing')
  })

  test.each([
    ['ENABLE', 'an app not in the catalogue', snapshot(), 'ghost', 'APP_NOT_FOUND', 404],
    ['ENABLE', 'an open request', snapshot({ open: [{ appId: 'hello', action: 'ENABLE' }] }), 'hello', 'REQUEST_OPEN', 409],
    ['DISABLE', 'an open request', snapshot({ open: [{ appId: 'hello', action: 'ENABLE' }] }), 'hello', 'REQUEST_OPEN', 409],
    ['ENABLE', 'an app already enabled', snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }] }), 'hello', 'ALREADY_ENABLED', 409],
    ['DISABLE', 'an app that is not enabled', snapshot(), 'hello', 'NOT_ENABLED', 409],
    ['ENABLE', 'an app enabled for all', snapshot({ enablements: [{ appId: 'hello', htxCode: '*' }] }), 'hello', 'ENABLED_FOR_ALL', 409],
    ['DISABLE', 'an app enabled for all', snapshot({ enablements: [{ appId: 'hello', htxCode: '*' }] }), 'hello', 'ENABLED_FOR_ALL', 409],
    // Review focus 3: another HTX’s enablement is invisible to this one.
    [
      'DISABLE',
      'an app enabled only by another HTX',
      snapshot({ enablements: [] /* the repository only returns this HTX and * */ }),
      'hello',
      'NOT_ENABLED',
      409,
    ],
  ])('%s with %s -> %s', async (action, _name, snap, appId, errorCode, status) => {
    const { useCase, repository } = setup(snap)
    const error = await code(useCase.requestChange(tenant, appId, action as 'ENABLE' | 'DISABLE'))
    expect(error).toBeInstanceOf(AppStoreError)
    expect([error.code, error.status]).toEqual([errorCode, status])
    expect(repository.createRequest).not.toHaveBeenCalled()
  })

  test('a unique violation from the repository stays REQUEST_OPEN', async () => {
    const { useCase, repository } = setup()
    repository.createRequest.mockRejectedValue(new AppStoreError('REQUEST_OPEN', 'đang xử lý'))
    expect((await code(useCase.requestChange(tenant, 'hello', 'ENABLE'))).code).toBe('REQUEST_OPEN')
  })
})

const teaShop = (over: Record<string, unknown> = {}) => ({
  ...catalogApp('tea-shop'),
  menu: [{ label: 'Cửa hàng', path: '/', roles: ['manager', 'officer'] }],
  ...over,
})
const enabledTC = (appId: string) => ({ appId, htxCode: 'TC' })

describe('AppStoreUseCase.list (store fields)', () => {
  test('openHref points at the first manager menu entry when the HTX can use the app', async () => {
    const leaf = teaShop({
      id: 'leaf-purchase',
      menu: [
        { label: 'Tổng quan', path: '/dash', roles: ['officer'] },
        { label: 'Kỳ thu mua', path: '/periods', roles: ['manager'] },
      ],
    })
    const { useCase } = setup(snapshot({ apps: [teaShop(), leaf], enablements: [enabledTC('tea-shop'), enabledTC('leaf-purchase')] }))
    const { apps } = await useCase.list('TC')
    expect(apps.map(app => app.openHref)).toEqual(['/manager/apps/tea-shop', '/manager/apps/leaf-purchase/periods'])
  })

  test('openHref is null when not enabled or without a manager entry', async () => {
    const officerOnly = teaShop({ id: 'officer-app', menu: [{ label: 'X', path: '/x', roles: ['officer'] }] })
    const { useCase } = setup(snapshot({ apps: [teaShop(), officerOnly], enablements: [enabledTC('officer-app')] }))
    const { apps } = await useCase.list('TC')
    expect(apps.map(app => app.openHref)).toEqual([null, null])
  })

  test('phase comes from the open request, or from the last request when failed, else null', async () => {
    const { useCase } = setup(
      snapshot({
        apps: [catalogApp('a'), catalogApp('b'), catalogApp('c'), catalogApp('d')],
        open: [{ appId: 'a', action: 'ENABLE', phase: 'build' }],
        latest: [
          { appId: 'b', status: 'FAILED', error: 'x', phase: 'register' },
          { appId: 'c', status: 'DONE', error: null, phase: 'register' },
        ],
      }),
    )
    const { apps } = await useCase.list('TC')
    expect(apps.map(app => app.phase)).toEqual(['build', 'register', null, null])
  })

  test('installedVersion reaches the card and the detail', async () => {
    const { useCase } = setup(snapshot({ apps: [{ ...catalogApp('a'), installedVersion: '0.1.0' }] }))
    expect((await useCase.list('TC')).apps[0].installedVersion).toBe('0.1.0')
    expect((await useCase.detail('TC', 'a')).installedVersion).toBe('0.1.0')
  })

  test('category, icon and installedOnServer come from the catalogue', async () => {
    const { useCase } = setup(snapshot({ apps: [{ ...catalogApp('a'), installedOnServer: true, store: { category: 'sales', icon: 'scale' } }] }))
    expect((await useCase.list('TC')).apps[0]).toMatchObject({ category: 'sales', icon: 'scale', installedOnServer: true })
  })

  test.each([
    ['not an object', 'oops'],
    ['null', null],
    ['an array', ['x']],
    ['an unknown category and icon', { category: 'weapons', icon: '<svg onload=1>' }],
    ['wrong field types', { category: 7, icon: 7, about: 7, data: 'x', personal_data: 7, core_reads: [1, 'ok'] }],
  ])('a malformed store (%s) degrades and never throws', async (_name, store) => {
    const { useCase } = setup(snapshot({ apps: [{ ...catalogApp('a'), store }] }))
    const detail = await useCase.detail('TC', 'a')
    expect(detail).toMatchObject({ category: null, icon: null, about: [], data: [], personalData: null })
  })
})

describe('AppStoreUseCase.detail', () => {
  test('throws APP_NOT_FOUND for an app not in the catalogue', async () => {
    const { useCase } = setup()
    const error = await code(useCase.detail('TC', 'ghost'))
    expect([error.code, error.status]).toEqual(['APP_NOT_FOUND', 404])
  })

  test('splits about on blank lines into trimmed, non-empty paragraphs', async () => {
    const store = { about: '  Một.\nvẫn một.\n\n\n  Hai.  \n\n   \n', data: ['a'], personal_data: 'tên', core_reads: ['members'] }
    const { useCase } = setup(snapshot({ apps: [{ ...catalogApp('a'), store, requiresCore: '>=1.10.0', hasDatabase: true }] }))
    expect(await useCase.detail('TC', 'a')).toMatchObject({
      about: ['Một.\nvẫn một.', 'Hai.'],
      data: ['a'],
      personalData: 'tên',
      coreReads: ['members'],
      requiresCore: '>=1.10.0',
      hasDatabase: true,
    })
  })

  test('adds the preview, screenshots, history and public URL for the caller HTX', async () => {
    const { useCase, repository } = setup(
      snapshot({ apps: [teaShop({ hasPublic: true })], enablements: [enabledTC('tea-shop')] }),
    )
    repository.screenshots.mockResolvedValue([{ position: 0, caption: 'Trang chủ' }])
    const detail = await useCase.detail('TC', 'tea-shop')
    expect(repository.history).toHaveBeenCalledWith('TC', 'tea-shop', 20)
    expect(detail.screenshots).toEqual([{ position: 0, caption: 'Trang chủ', url: '/api/app-store/apps/tea-shop/screenshots/0' }])
    expect(detail.publicUrl).toBe('/apps/tea-shop/public/TC')
    expect(detail.preview[0]).toBe('Thêm mục "Cửa hàng" cho Trưởng HTX, Cán bộ')
    expect(detail.menu).toEqual([{ label: 'Cửa hàng', path: '/', roles: ['manager', 'officer'] }])
  })

  test('publicUrl is null when the app is not usable by the HTX', async () => {
    const { useCase } = setup(snapshot({ apps: [teaShop({ hasPublic: true })] }))
    expect((await useCase.detail('TC', 'tea-shop')).publicUrl).toBeNull()
  })
})

describe('AppStoreUseCase.history and screenshot', () => {
  test('history asks for the 50 newest of the caller HTX', async () => {
    const { useCase, repository } = setup()
    await useCase.history('TC')
    expect(repository.history).toHaveBeenCalledWith('TC', null, 50)
  })

  test('screenshot returns what the repository holds', async () => {
    const { useCase, repository } = setup()
    const image = { contentType: 'image/png', bytes: new Uint8Array([1]) }
    repository.screenshot.mockResolvedValue(image)
    await expect(useCase.screenshot('hello', 0)).resolves.toBe(image)
    expect(repository.screenshot).toHaveBeenCalledWith('hello', 0)
  })
})
