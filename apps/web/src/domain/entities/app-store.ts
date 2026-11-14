// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type AppStoreStatus = 'available' | 'installing' | 'enabled' | 'enabled_all' | 'removing' | 'failed'
export type StoreAction = 'ENABLE' | 'DISABLE'
export type StoreCategory = 'production' | 'sales' | 'members' | 'tourism' | 'sample'
export type InstallPhase = 'prepare' | 'build' | 'register'
export type RequestStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

export const STORE_CATEGORIES: readonly StoreCategory[] = ['production', 'sales', 'members', 'tourism', 'sample']
/** Icon names a manifest may use; the web draws them from its own icon set. */
export const STORE_ICONS = ['leaf', 'scale', 'shopping-bag', 'package', 'map-pinned', 'users', 'calendar', 'clipboard-list', 'truck', 'sparkles'] as const

export interface StoreMenuEntry {
  label: string
  path: string
  roles: string[]
}

/** A mini-app card of the App Store, as one HTX sees it. */
export interface StoreApp {
  id: string
  name: string
  version: string
  description: string
  license: string
  publisher: string
  roles: string[]
  hasPublic: boolean
  status: AppStoreStatus
  error: string | null
  category: StoreCategory | null
  icon: string | null
  installedOnServer: boolean
  /** Version registered on the server (`platform.installed_apps`), null when the app is not installed there. */
  installedVersion: string | null
  /** Phase of the open request, or of the last request when it failed. */
  phase: InstallPhase | null
  /** `/manager/apps/<id><path>` of the first menu entry for managers when the HTX can use the app, else null. */
  openHref: string | null
}

export interface StoreHistoryEntry {
  id: string
  appId: string
  appName: string
  action: StoreAction
  status: RequestStatus
  requestedByName: string | null
  createdAt: string
  finishedAt: string | null
  error: string | null
}

export interface StoreScreenshot {
  position: number
  caption: string
  url: string
}

export interface StoreAppDetail extends StoreApp {
  about: string[]
  menu: StoreMenuEntry[]
  data: string[]
  personalData: string | null
  coreReads: string[]
  requiresCore: string
  hasDatabase: boolean
  /** `/apps/<id>/public/<htxCode>` when the app has public pages and the HTX can use it. */
  publicUrl: string | null
  preview: string[]
  screenshots: StoreScreenshot[]
  history: StoreHistoryEntry[]
}

/** A catalogue row as stored: `store` is the manifest block, unchecked (see the use case, which degrades a bad shape). */
export type CatalogApp = Omit<StoreApp, 'status' | 'error' | 'category' | 'icon' | 'phase' | 'openHref'> & {
  menu: StoreMenuEntry[]
  hasDatabase: boolean
  requiresCore: string | null
  store: unknown
}

/** What the repository knows about one HTX; the status of each app is derived from it (see appStatus). */
export interface AppStoreSnapshot {
  apps: CatalogApp[]
  open: { appId: string; action: StoreAction; phase?: InstallPhase | null }[]
  /** Enablements for the HTX or for every HTX (`*`). */
  enablements: { appId: string; htxCode: string }[]
  /** The newest request of the HTX per app. */
  latest: { appId: string; status: string; error: string | null; phase?: InstallPhase | null }[]
}

export interface AppStoreRepository {
  snapshot(htxCode: string): Promise<AppStoreSnapshot>
  /** True when the worker polled in the last 30 seconds. */
  workerAlive(): Promise<boolean>
  /** Throws AppStoreError REQUEST_OPEN when the app already has an open request for the HTX. */
  createRequest(appId: string, htxCode: string, action: StoreAction, requestedBy: string, requestedByName: string | null): Promise<void>
  /** The newest requests of one HTX, for one app or (null) for all. */
  history(htxCode: string, appId: string | null, limit: number): Promise<StoreHistoryEntry[]>
  /** Positions and captions only; the bytes are read one at a time by `screenshot`. */
  screenshots(appId: string): Promise<{ position: number; caption: string }[]>
  screenshot(appId: string, position: number): Promise<{ contentType: string; bytes: Uint8Array } | null>
}

export type AppStoreErrorCode = 'APP_NOT_FOUND' | 'REQUEST_OPEN' | 'ALREADY_ENABLED' | 'NOT_ENABLED' | 'ENABLED_FOR_ALL'

const STATUS: Record<AppStoreErrorCode, number> = {
  APP_NOT_FOUND: 404,
  REQUEST_OPEN: 409,
  ALREADY_ENABLED: 409,
  NOT_ENABLED: 409,
  ENABLED_FOR_ALL: 409,
}

/** An expected refusal; the route answers it with `status` and `{ error: { code, message } }`. */
export class AppStoreError extends Error {
  readonly status: number
  constructor(readonly code: AppStoreErrorCode, message: string) {
    super(message)
    this.name = 'AppStoreError'
    this.status = STATUS[code]
  }
}
