// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Mini-app factory (M13): a manager's request for an app, and the builds made for it (plan contract C1).

export const BUILD_REQUEST_STATUSES = [
  'new',
  'asking',
  'routed',
  'spec_proposed',
  'spec_approved',
  'building',
  'passed',
  'failed',
  'installed',
  'cancelled',
] as const
export type BuildRequestStatus = (typeof BUILD_REQUEST_STATUSES)[number]

/** A request in one of these statuses holds the cooperative's one build slot (§12.1). */
export const ACTIVE_REQUEST_STATUSES: readonly BuildRequestStatus[] = ['new', 'asking', 'spec_proposed', 'spec_approved', 'building']

export type BuildPath = 'store' | 'book' | 'build'
export type BuildFileName =
  | 'desktop-light.png'
  | 'desktop-dark.png'
  | 'mobile-light.png'
  | 'mobile-dark.png'
  | 'review.md'
  | 'spec.md'

export const BUILD_FILE_NAMES: readonly BuildFileName[] = [
  'desktop-light.png',
  'desktop-dark.png',
  'mobile-light.png',
  'mobile-dark.png',
  'review.md',
  'spec.md',
]
export const SCREENSHOT_NAMES = BUILD_FILE_NAMES.filter((name) => name.endsWith('.png'))

export const MAX_QUESTIONS = 5
export const MAX_QUESTION_LENGTH = 160
export const GENERATED_APP_ID_PATTERN = /^gen-[a-z0-9-]{3,27}$/

export interface AppBuildRequest {
  id: string
  htxCode: string
  requestedBy: string
  requestedByName: string | null
  requestText: string
  questions: string[]
  answerText: string | null
  path: BuildPath | null
  appId: string | null
  spec: Record<string, unknown> | null
  status: BuildRequestStatus
  errorVi: string | null
  announcedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface GateResult {
  name: string
  ok: boolean
  detail_vi: string
}

export interface AppBuild {
  id: string
  requestId: string
  htxCode: string
  appId: string
  version: string
  provider: string
  rounds: number
  status: 'running' | 'passed' | 'failed'
  gates: GateResult[]
  gitTag: string | null
  startedAt: Date
  finishedAt: Date | null
}

/** The catalogue facts an install or removal is judged on. */
export interface CatalogOwnership {
  appId: string
  ownerHtx: string | null
  buildId: string | null
}

export interface BuildFile {
  contentType: string
  bytes: Uint8Array
}

export type AppBuildErrorCode = 'REQUEST_ACTIVE' | 'APP_ID_TAKEN' | 'REQUEST_NOT_FOUND' | 'WRONG_STATE' | 'NOT_INSTALLABLE'

const STATUS: Record<AppBuildErrorCode, number> = {
  REQUEST_ACTIVE: 409,
  APP_ID_TAKEN: 409,
  REQUEST_NOT_FOUND: 404,
  WRONG_STATE: 409,
  NOT_INSTALLABLE: 409,
}

/** An expected refusal; the route answers it with `status` and `{ error: { code, message } }`. */
export class AppBuildError extends Error {
  readonly status: number
  constructor(readonly code: AppBuildErrorCode, message: string) {
    super(message)
    this.name = 'AppBuildError'
    this.status = STATUS[code]
  }
}

export interface NewBuildRequest {
  htxCode: string
  requestedBy: string
  requestedByName: string | null
  requestText: string
}

export interface AppBuildRepository {
  /** Throws REQUEST_ACTIVE when the cooperative already holds an active request. */
  create(input: NewBuildRequest): Promise<AppBuildRequest>
  findById(htxCode: string, id: string): Promise<AppBuildRequest | null>
  list(htxCode: string, limit: number): Promise<AppBuildRequest[]>
  /** Requests in `new`, in `asking` with an answer, and over (`passed` or `failed`) but not yet announced, oldest first. */
  waitingForAgent(htxCode: string): Promise<AppBuildRequest[]>
  /** `new` to `asking`. False when the request was not `new`. */
  setQuestions(htxCode: string, id: string, questions: string[]): Promise<boolean>
  /** Stores the answer of an `asking` request that has none yet. False otherwise. */
  setAnswer(htxCode: string, id: string, answerText: string): Promise<boolean>
  /** `new` or `asking` to `routed`. False otherwise. */
  setRouted(htxCode: string, id: string, path: 'store' | 'book', target: string): Promise<boolean>
  /** `new` or `asking` to `spec_proposed`. Throws APP_ID_TAKEN when the id is in the catalogue or in `app_builds`. */
  setSpec(htxCode: string, id: string, appId: string, spec: Record<string, unknown>): Promise<boolean>
  /** Undoes `setRouted` or `setSpec` when their proposal could not be created: back to `previous`' status, path, id and spec. */
  restore(htxCode: string, id: string, previous: AppBuildRequest): Promise<boolean>
  /** `spec_proposed` to `spec_approved`. False when the request moved. */
  approveSpec(htxCode: string, id: string): Promise<boolean>
  /** `new`, `asking` or `spec_proposed` to `cancelled`. */
  cancel(htxCode: string, id: string): Promise<boolean>
  /** `routed` or `passed` to `installed`, for the request that named this app. */
  markInstalledByApp(htxCode: string, appId: string): Promise<boolean>
  /** The newest store request (`platform.app_requests`) of the cooperative for the app. */
  latestStoreRequestId(htxCode: string, appId: string): Promise<string | null>
  /** Sets `announced_at` once, for a request in `passed` or `failed`; null when it was announced already or is not over. */
  claimAnnounce(htxCode: string, id: string, now: Date): Promise<AppBuildRequest | null>
  releaseAnnounce(htxCode: string, id: string): Promise<void>
  latestBuild(htxCode: string, requestId: string): Promise<AppBuild | null>
  buildFile(htxCode: string, buildId: string, name: BuildFileName): Promise<BuildFile | null>
  /** A build's file by name whatever its cooperative: the relay's media route, which holds no tenant. */
  screenshotOfBuild(buildId: string, name: BuildFileName): Promise<BuildFile | null>
  /** The request that produced a catalogue app, from its build. */
  requestOfApp(appId: string): Promise<AppBuildRequest | null>
  catalogOwnership(appId: string): Promise<CatalogOwnership | null>
  /** The build behind a catalogue row, with the cooperative of its request. */
  buildById(buildId: string): Promise<AppBuild | null>
  /** The open `app.spec.approve` proposal of a request, if any. */
  openSpecProposalId(htxCode: string, requestId: string): Promise<string | null>
}
