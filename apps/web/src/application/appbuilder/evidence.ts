// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import type { EvidenceRow } from '@/domain/agent/proposal'
import type { AppBuild, AppBuildRepository, AppBuildRequest } from '@/domain/appbuilder/app-build'
import { specDigest } from './app-spec'

/**
 * What a proposal about a request cites. The proposal goes stale when any of it changes: the status, the app, the spec
 * (the full spec while it awaits approval) or, once built, the gate figures.
 */
export function requestEvidenceValues(request: AppBuildRequest, build: AppBuild | null): Record<string, unknown> {
  const spec = request.spec
  const name = spec && typeof spec.name_vi === 'string' ? spec.name_vi : null
  return {
    id: request.id,
    status: request.status,
    path: request.path,
    app_id: request.appId,
    name_vi: name,
    spec_sha256: spec ? specDigest(spec) : null,
    spec: request.status === 'spec_proposed' ? spec : null,
    gates_passed: build ? build.gates.filter((gate) => gate.ok).length : null,
    gates_total: build ? build.gates.length : null,
  }
}

export function requestEvidenceRow(request: AppBuildRequest, build: AppBuild | null): EvidenceRow {
  const values = requestEvidenceValues(request, build)
  return { table: 'app_build_requests', id: request.id, sha256: sha256Hex(canonicalJson(values)), values }
}

/** Evidence loader of the table: the values of one request of this cooperative, or null when it is not there. */
export async function loadRequestEvidence(
  repo: Pick<AppBuildRepository, 'findById' | 'latestBuild'>,
  htxCode: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const request = await repo.findById(htxCode, id)
  if (!request) return null
  return requestEvidenceValues(request, await repo.latestBuild(htxCode, id))
}
