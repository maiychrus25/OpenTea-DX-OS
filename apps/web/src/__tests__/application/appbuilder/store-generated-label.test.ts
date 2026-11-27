/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import type { AppStoreRepository, AppStoreSnapshot } from '@/domain/entities/app-store'

const app = (id: string, over: object = {}) => ({
  id, name: id, version: '0.1.0', description: '', license: 'MIT', publisher: 'p', roles: ['manager'], hasPublic: false, menu: [],
  hasDatabase: false, requiresCore: null, store: {}, installedOnServer: true, installedVersion: '0.1.0', ...over,
})

function useCase(apps: AppStoreSnapshot['apps']) {
  const repository = {
    snapshot: async () => ({ apps, open: [], enablements: [], latest: [] }),
    workerAlive: async () => true,
    screenshots: async () => [],
    history: async () => [],
  } as unknown as AppStoreRepository
  return new AppStoreUseCase(repository)
}

describe('the store card of a generated app (C8)', () => {
  it('is marked generated and points at the request of its build', async () => {
    const { apps } = await useCase([app('tea-shop'), app('gen-fert', { ownerHtx: 'TC', buildRequestId: 'req-1' })]).list('TC')
    expect(apps.find((a) => a.id === 'gen-fert')).toMatchObject({ generated: true, buildRequestId: 'req-1' })
    expect(apps.find((a) => a.id === 'tea-shop')?.generated).toBeUndefined()
    expect(apps.find((a) => a.id === 'gen-fert')).not.toHaveProperty('ownerHtx')
  })

  it('carries the label into the detail page', async () => {
    const detail = await useCase([app('gen-fert', { ownerHtx: 'TC', buildRequestId: 'req-1' })]).detail('TC', 'gen-fert')
    expect(detail).toMatchObject({ generated: true, buildRequestId: 'req-1' })
  })
})
