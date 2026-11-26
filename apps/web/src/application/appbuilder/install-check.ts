// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppBuildError, type AppBuildRepository } from '@/domain/appbuilder/app-build'

export const NOT_INSTALLABLE_VI = 'Bản này chưa qua kiểm tra hoặc không thuộc HTX này'

/**
 * Test 28: a generated app may be enabled only by the cooperative that owns it, from a build that passed every gate,
 * for a request whose specification was approved. A store app has no owner and needs none of this.
 */
export async function assertInstallable(
  repo: Pick<AppBuildRepository, 'catalogOwnership' | 'buildById' | 'findById'>,
  htxCode: string,
  appId: string
): Promise<void> {
  const owned = await repo.catalogOwnership(appId)
  if (!owned) throw new AppBuildError('NOT_INSTALLABLE', 'Không có ứng dụng này trong kho')
  if (owned.ownerHtx === null && !appId.startsWith('gen-')) return

  if (owned.ownerHtx !== htxCode || !owned.buildId) throw new AppBuildError('NOT_INSTALLABLE', NOT_INSTALLABLE_VI)
  const build = await repo.buildById(owned.buildId)
  if (!build || build.status !== 'passed' || build.htxCode !== htxCode || build.appId !== appId) {
    throw new AppBuildError('NOT_INSTALLABLE', NOT_INSTALLABLE_VI)
  }
  const request = await repo.findById(htxCode, build.requestId)
  if (!request || request.spec === null || !['passed', 'installed'].includes(request.status)) {
    throw new AppBuildError('NOT_INSTALLABLE', NOT_INSTALLABLE_VI)
  }
}

/** A removal is allowed for a store app, or for a generated app of the same cooperative. */
export async function assertRemovable(
  repo: Pick<AppBuildRepository, 'catalogOwnership'>,
  htxCode: string,
  appId: string
): Promise<void> {
  const owned = await repo.catalogOwnership(appId)
  if (!owned || (owned.ownerHtx !== null && owned.ownerHtx !== htxCode)) {
    throw new AppBuildError('NOT_INSTALLABLE', 'Không có ứng dụng này trong kho')
  }
}
