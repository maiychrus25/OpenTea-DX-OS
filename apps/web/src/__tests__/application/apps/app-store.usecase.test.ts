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
    createRequest: jest.fn().mockResolvedValue(undefined),
  }
  return { repository, useCase: new AppStoreUseCase(repository) }
}
const tenant = { htxCode: 'TC', userId: 'u1' }
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
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'ENABLE', 'u1')
  })

  test('DISABLE queues a request and says removing', async () => {
    const { useCase, repository } = setup(snapshot({ enablements: [{ appId: 'hello', htxCode: 'TC' }] }))
    await expect(useCase.requestChange(tenant, 'hello', 'DISABLE')).resolves.toBe('removing')
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'DISABLE', 'u1')
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
