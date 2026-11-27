// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { SCREENSHOT_NAMES, type AppBuildRepository, type AppBuildRequest, type BuildRequestStatus, type GateResult } from '@/domain/appbuilder/app-build'
import { appSpecSchema, type AppSpec } from './app-spec'

export const STATUS_VI: Record<BuildRequestStatus, string> = {
  new: 'Mới gửi',
  asking: 'Trợ lý đang hỏi',
  routed: 'Đã đề xuất dùng app có sẵn',
  spec_proposed: 'Chờ bạn duyệt đặc tả',
  spec_approved: 'Đã duyệt, chờ xây',
  building: 'Đang xây',
  passed: 'Đã xây xong, chờ bạn cài',
  failed: 'Không xây được',
  installed: 'Đã cài',
  cancelled: 'Đã huỷ',
}

export interface AppRequestSummary {
  id: string
  requestText: string
  status: BuildRequestStatus
  statusVi: string
  createdAt: string
  questions: string[]
  answerText: string | null
  errorVi: string | null
  appId: string | null
  /** The manager may answer: A12 asked and no answer is stored yet. */
  canAnswer: boolean
  /** The manager may close the request: it has not been approved for building. */
  canCancel: boolean
}

export interface AppRequestDetail extends AppRequestSummary {
  spec: AppSpec | null
  gates: GateResult[]
  buildVersion: string | null
  review: string | null
  screenshots: { name: string; url: string }[]
  /** The open `app.spec.approve` proposal, decided through the proposals endpoint. */
  specProposalId: string | null
}

export function summarise(request: AppBuildRequest): AppRequestSummary {
  return {
    id: request.id,
    requestText: request.requestText,
    status: request.status,
    statusVi: STATUS_VI[request.status],
    createdAt: request.createdAt.toISOString(),
    questions: request.questions,
    answerText: request.answerText,
    errorVi: request.errorVi,
    appId: request.appId,
    canAnswer: request.status === 'asking' && request.answerText === null,
    canCancel: ['new', 'asking', 'spec_proposed'].includes(request.status),
  }
}

export async function listAppRequests(repo: Pick<AppBuildRepository, 'list'>, htxCode: string): Promise<AppRequestSummary[]> {
  return (await repo.list(htxCode, 30)).map(summarise)
}

/** One request with its spec, the gate table, the review and the screenshots of the latest build. */
export async function appRequestDetail(repo: AppBuildRepository, htxCode: string, id: string): Promise<AppRequestDetail | null> {
  const request = await repo.findById(htxCode, id)
  if (!request) return null
  const build = await repo.latestBuild(htxCode, id)
  const spec = appSpecSchema.safeParse(request.spec)
  const files = build ? await Promise.all([...SCREENSHOT_NAMES, 'review.md' as const].map(async (name) => [name, await repo.buildFile(htxCode, build.id, name)] as const)) : []
  const present = new Map(files.filter(([, file]) => file !== null))
  const reviewFile = present.get('review.md')
  return {
    ...summarise(request),
    spec: spec.success ? spec.data : null,
    gates: build?.gates ?? [],
    buildVersion: build?.version ?? null,
    review: reviewFile ? Buffer.from(reviewFile.bytes).toString('utf8') : null,
    screenshots: SCREENSHOT_NAMES.filter((name) => present.has(name)).map((name) => ({ name, url: `/api/agent/app-requests/${id}/files/${name}` })),
    specProposalId: request.status === 'spec_proposed' ? await repo.openSpecProposalId(htxCode, id) : null,
  }
}
