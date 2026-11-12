// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  AppStoreError,
  type AppStoreRepository,
  type AppStoreSnapshot,
  type AppStoreStatus,
  type StoreAction,
  type StoreApp,
} from '@/domain/entities/app-store'

/** First match wins: open request, then enablement for every HTX, then for this HTX, then a failed last request. */
export function appStatus(appId: string, snapshot: AppStoreSnapshot, htxCode: string): { status: AppStoreStatus; error: string | null } {
  const open = snapshot.open.find(request => request.appId === appId)
  if (open) return { status: open.action === 'ENABLE' ? 'installing' : 'removing', error: null }
  const enablements = snapshot.enablements.filter(enablement => enablement.appId === appId)
  if (enablements.some(enablement => enablement.htxCode === '*')) return { status: 'enabled_all', error: null }
  if (enablements.some(enablement => enablement.htxCode === htxCode)) return { status: 'enabled', error: null }
  const latest = snapshot.latest.find(request => request.appId === appId)
  if (latest?.status === 'FAILED') return { status: 'failed', error: latest.error }
  return { status: 'available', error: null }
}

const REFUSALS: Record<StoreAction, Partial<Record<AppStoreStatus, AppStoreError>>> = {
  ENABLE: {
    installing: new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.'),
    removing: new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.'),
    enabled: new AppStoreError('ALREADY_ENABLED', 'HTX đã cài ứng dụng này.'),
    enabled_all: new AppStoreError('ENABLED_FOR_ALL', 'Ứng dụng đã được quản trị máy chủ cài cho mọi HTX.'),
  },
  DISABLE: {
    installing: new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.'),
    removing: new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.'),
    available: new AppStoreError('NOT_ENABLED', 'HTX chưa cài ứng dụng này.'),
    failed: new AppStoreError('NOT_ENABLED', 'HTX chưa cài ứng dụng này.'),
    enabled_all: new AppStoreError('ENABLED_FOR_ALL', 'Ứng dụng đã được quản trị máy chủ cài cho mọi HTX.'),
  },
}

export class AppStoreUseCase {
  constructor(private readonly repository: AppStoreRepository) {}

  async list(htxCode: string): Promise<{ workerAlive: boolean; apps: StoreApp[] }> {
    const [snapshot, workerAlive] = await Promise.all([this.repository.snapshot(htxCode), this.repository.workerAlive()])
    return { workerAlive, apps: snapshot.apps.map(app => ({ ...app, ...appStatus(app.id, snapshot, htxCode) })) }
  }

  /** Queues an install or removal for the caller's HTX; the worker does it later. */
  async requestChange(tenant: { htxCode: string; userId: string }, appId: string, action: StoreAction): Promise<'installing' | 'removing'> {
    const snapshot = await this.repository.snapshot(tenant.htxCode)
    if (!snapshot.apps.some(app => app.id === appId)) throw new AppStoreError('APP_NOT_FOUND', 'Không có ứng dụng này trong kho.')
    const refusal = REFUSALS[action][appStatus(appId, snapshot, tenant.htxCode).status]
    if (refusal) throw refusal
    await this.repository.createRequest(appId, tenant.htxCode, action, tenant.userId)
    return action === 'ENABLE' ? 'installing' : 'removing'
  }
}
