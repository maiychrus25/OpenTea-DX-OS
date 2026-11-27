/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppStoreUseCase, MERGED_INTO_CORE } from '@/application/apps/app-store.usecase'
import { AppStoreError, type AppStoreRepository, type AppStoreSnapshot } from '@/domain/entities/app-store'
import type { InstalledApp } from '@/domain/entities/installed-app'
import { loadAppNavItems } from '@/lib/apps/app-nav'

const catalogApp = (id: string) => ({
  id, name: id, version: '1.0.0', description: '', license: 'MIT', publisher: 'P', roles: ['manager'], hasPublic: false,
  menu: [{ label: id, path: '/', roles: ['manager'] }], hasDatabase: false, requiresCore: null as string | null,
  installedOnServer: true, installedVersion: '1.0.0', store: {} as unknown,
})
const snapshot: AppStoreSnapshot = {
  apps: ['leaf-purchase', 'farm-supply', 'tea-shop'].map(catalogApp),
  open: [],
  enablements: [{ appId: 'leaf-purchase', htxCode: 'TC' }],
  latest: [],
}
const repository = (): jest.Mocked<AppStoreRepository> => ({
  snapshot: jest.fn().mockResolvedValue(snapshot),
  workerAlive: jest.fn().mockResolvedValue(true),
  history: jest.fn().mockResolvedValue([]),
  screenshots: jest.fn().mockResolvedValue([]),
  screenshot: jest.fn().mockResolvedValue(null),
  createRequest: jest.fn().mockResolvedValue(undefined),
})
const tenant = { htxCode: 'TC', userId: 'u1', userName: 'An' }

test('the merged apps are leaf-purchase and farm-supply', () => {
  expect([...MERGED_INTO_CORE]).toEqual(['leaf-purchase', 'farm-supply'])
})

describe('labs off', () => {
  test('neither merged app is listed', async () => {
    const result = await new AppStoreUseCase(repository(), undefined, () => false).list('TC')
    expect(result.apps.map((app) => app.id)).toEqual(['tea-shop'])
  })

  test.each(['ENABLE', 'DISABLE'] as const)('%s of a merged app is refused and queues nothing', async (action) => {
    const repo = repository()
    const error = (await new AppStoreUseCase(repo, undefined, () => false).requestChange(tenant, 'leaf-purchase', action).catch((e: unknown) => e)) as AppStoreError
    expect(error).toBeInstanceOf(AppStoreError)
    expect([error.code, error.status]).toEqual(['MERGED_INTO_CORE', 409])
    expect(repo.createRequest).not.toHaveBeenCalled()
  })

  test('the detail of a merged app says it was merged and offers no install', async () => {
    const detail = await new AppStoreUseCase(repository(), undefined, () => false).detail('TC', 'farm-supply')
    expect(detail.mergedIntoCore).toBe(true)
    expect(detail.mergedIntoCoreNote).toBe('Đã hợp nhất vào lõi')
  })

  test('an ordinary app is untouched', async () => {
    const useCase = new AppStoreUseCase(repository(), undefined, () => false)
    expect((await useCase.detail('TC', 'tea-shop')).mergedIntoCore).toBe(false)
    await expect(useCase.requestChange(tenant, 'tea-shop', 'ENABLE')).resolves.toBe('installing')
  })

  test('the mini-app menu has no entry of a merged app, even an enabled one', async () => {
    const installed = (id: string): InstalledApp => ({ id, name: id, version: '1', menu: [{ label: id, path: '/', roles: ['manager'] }], publicPrefixes: [], feed: null })
    const list = jest.fn().mockResolvedValue([installed('leaf-purchase'), installed('farm-supply'), installed('tea-shop')])
    const items = await loadAppNavItems({ list }, 'manager', 'TC', undefined, false)
    expect(items.map((item) => item.href)).toEqual(['/manager/apps/tea-shop'])
  })
})

describe('labs on', () => {
  test('both merged apps are listed and installable', async () => {
    const repo = repository()
    const useCase = new AppStoreUseCase(repo, undefined, () => true)
    expect((await useCase.list('TC')).apps.map((app) => app.id)).toEqual(['leaf-purchase', 'farm-supply', 'tea-shop'])
    expect((await useCase.detail('TC', 'leaf-purchase')).mergedIntoCore).toBe(false)
    await expect(useCase.requestChange(tenant, 'farm-supply', 'ENABLE')).resolves.toBe('installing')
  })

  test('the menu keeps them', async () => {
    const installed = (id: string): InstalledApp => ({ id, name: id, version: '1', menu: [{ label: id, path: '/', roles: ['manager'] }], publicPrefixes: [], feed: null })
    const items = await loadAppNavItems({ list: jest.fn().mockResolvedValue([installed('leaf-purchase'), installed('tea-shop')]) }, 'manager', 'TC', undefined, true)
    expect(items.map((item) => item.href)).toEqual(['/manager/apps/leaf-purchase', '/manager/apps/tea-shop'])
  })
})
