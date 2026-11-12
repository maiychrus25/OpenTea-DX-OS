// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export type AppStoreStatus = 'available' | 'installing' | 'enabled' | 'enabled_all' | 'removing' | 'failed'
export type StoreAction = 'ENABLE' | 'DISABLE'

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
}

export type CatalogApp = Omit<StoreApp, 'status' | 'error'>

/** What the repository knows about one HTX; the status of each app is derived from it (see appStatus). */
export interface AppStoreSnapshot {
  apps: CatalogApp[]
  open: { appId: string; action: StoreAction }[]
  /** Enablements for the HTX or for every HTX (`*`). */
  enablements: { appId: string; htxCode: string }[]
  /** The newest request of the HTX per app. */
  latest: { appId: string; status: string; error: string | null }[]
}

export interface AppStoreRepository {
  snapshot(htxCode: string): Promise<AppStoreSnapshot>
  /** True when the worker polled in the last 30 seconds. */
  workerAlive(): Promise<boolean>
  /** Throws AppStoreError REQUEST_OPEN when the app already has an open request for the HTX. */
  createRequest(appId: string, htxCode: string, action: StoreAction, requestedBy: string): Promise<void>
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
