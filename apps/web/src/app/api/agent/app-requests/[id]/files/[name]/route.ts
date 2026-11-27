// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { AppBuildError, BUILD_FILE_NAMES, type BuildFileName } from '@/domain/appbuilder/app-build'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { requireManagerSession, uuidParam, withAppBuildErrors } from '@/lib/api/app-build-response'
import { labsOnly } from '@/lib/labs'

/** A screenshot, the review or the spec of the request's latest build, for the manager of its cooperative. */
async function getBuildFile(_request: Request, context: unknown) {
  const who = await requireManagerSession()
  const id = await uuidParam(context)
  const { params } = context as { params: Promise<{ name: string }> | { name: string } }
  const name = (await params).name as BuildFileName
  if (!BUILD_FILE_NAMES.includes(name)) throw new AppBuildError('REQUEST_NOT_FOUND', 'Không có tệp này')
  const repo = new PrismaAppBuildRepository()
  const build = await repo.latestBuild(who.tenant.htxCode, id)
  const file = build ? await repo.buildFile(who.tenant.htxCode, build.id, name) : null
  if (!file) throw new AppBuildError('REQUEST_NOT_FOUND', 'Không có tệp này')
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  })
}

export const GET = withAppBuildErrors(labsOnly(getBuildFile))

// DXOS_LABS is read per request; a prerendered answer would freeze the switch into the build.
export const dynamic = 'force-dynamic'
