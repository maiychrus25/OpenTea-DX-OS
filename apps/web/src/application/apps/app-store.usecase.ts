// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import {
  AppStoreError,
  type AppStoreRepository,
  type AppStoreSnapshot,
  type AppStoreStatus,
  type CatalogApp,
  type InstallPhase,
  STORE_CATEGORIES,
  STORE_ICONS,
  type StoreAction,
  type StoreApp,
  type StoreAppDetail,
  type StoreCategory,
  type StoreHistoryEntry,
} from '@/domain/entities/app-store'
import { installPreview } from '@/application/apps/install-preview'

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

/** Phase of the open request, or of the newest request when it failed. */
function appPhase(appId: string, snapshot: AppStoreSnapshot): InstallPhase | null {
  const open = snapshot.open.find(request => request.appId === appId)
  if (open) return open.phase ?? null
  const latest = snapshot.latest.find(request => request.appId === appId)
  return latest?.status === 'FAILED' ? (latest.phase ?? null) : null
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** The manifest `store` block of a row; a wrong shape degrades to empty values and never throws. */
function parseStore(raw: unknown) {
  const store = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const category = STORE_CATEGORIES.find(item => item === store.category) ?? null
  const icon = STORE_ICONS.find(item => item === store.icon) ?? null
  const about = typeof store.about === 'string' ? store.about.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean) : []
  return {
    category: category as StoreCategory | null,
    icon: icon as string | null,
    about,
    data: strings(store.data),
    personalData: typeof store.personal_data === 'string' ? store.personal_data : null,
    coreReads: strings(store.core_reads),
  }
}

function toCard(app: CatalogApp, snapshot: AppStoreSnapshot, htxCode: string): StoreApp {
  const { status, error } = appStatus(app.id, snapshot, htxCode)
  const { category, icon } = parseStore(app.store)
  const usable = status === 'enabled' || status === 'enabled_all'
  const entry = usable ? app.menu.find(item => item.roles.includes('manager')) : undefined
  const { menu: _menu, hasDatabase: _db, requiresCore: _core, store: _store, ...card } = app
  return {
    ...card,
    status,
    error,
    category,
    icon,
    phase: appPhase(app.id, snapshot),
    openHref: entry ? `/manager/apps/${app.id}${entry.path === '/' ? '' : entry.path}` : null,
  }
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
    return { workerAlive, apps: snapshot.apps.map(app => toCard(app, snapshot, htxCode)) }
  }

  async detail(htxCode: string, appId: string): Promise<StoreAppDetail> {
    const snapshot = await this.repository.snapshot(htxCode)
    const app = snapshot.apps.find(item => item.id === appId)
    if (!app) throw new AppStoreError('APP_NOT_FOUND', 'Không có ứng dụng này trong kho.')
    const [shots, history] = await Promise.all([this.repository.screenshots(appId), this.repository.history(htxCode, appId, 20)])
    const card = toCard(app, snapshot, htxCode)
    const { about, data, personalData, coreReads } = parseStore(app.store)
    const usable = card.status === 'enabled' || card.status === 'enabled_all'
    return {
      ...card,
      about,
      menu: app.menu,
      data,
      personalData,
      coreReads,
      requiresCore: app.requiresCore ?? '',
      hasDatabase: app.hasDatabase,
      publicUrl: app.hasPublic && usable ? `/apps/${app.id}/public/${htxCode}` : null,
      preview: installPreview({ ...app, coreReads }, htxCode, usable),
      screenshots: shots.map(shot => ({ ...shot, url: `/api/app-store/apps/${app.id}/screenshots/${shot.position}` })),
      history,
    }
  }

  history(htxCode: string): Promise<StoreHistoryEntry[]> {
    return this.repository.history(htxCode, null, 50)
  }

  screenshot(appId: string, position: number) {
    return this.repository.screenshot(appId, position)
  }

  /** Queues an install or removal for the caller's HTX; the worker does it later. */
  async requestChange(tenant: { htxCode: string; userId: string; userName: string | null }, appId: string, action: StoreAction): Promise<'installing' | 'removing'> {
    const snapshot = await this.repository.snapshot(tenant.htxCode)
    if (!snapshot.apps.some(app => app.id === appId)) throw new AppStoreError('APP_NOT_FOUND', 'Không có ứng dụng này trong kho.')
    const refusal = REFUSALS[action][appStatus(appId, snapshot, tenant.htxCode).status]
    if (refusal) throw refusal
    await this.repository.createRequest(appId, tenant.htxCode, action, tenant.userId, tenant.userName)
    return action === 'ENABLE' ? 'installing' : 'removing'
  }
}
