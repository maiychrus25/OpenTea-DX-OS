// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloRepository } from '@/application/zalo/zalo-services'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import { requireTenant } from '@/lib/api/tenant'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloSettingsSchema } from '@/lib/validations/zalo.schema'
import { templateKeyOf, ZALO_EVENT_KINDS } from '@/domain/zalo/zalo-events'

async function view(htxCode: string) {
  const repo = zaloRepository()
  const [settings, templates, sent] = await Promise.all([
    repo.settings(htxCode),
    repo.templates(),
    repo.monthlyCount(htxCode, vnDayStart(`${vnDayOf(new Date()).slice(0, 7)}-01`)),
  ])
  return {
    enabled: settings.enabled,
    kinds: settings.kinds,
    quiet_start_hour: settings.quietStartHour,
    quiet_end_hour: settings.quietEndHour,
    monthly_quota: settings.monthlyQuota,
    sent_this_month: sent,
    // Kinds the platform has no approved template for yet: turning them on writes only skipped rows.
    kinds_without_template: ZALO_EVENT_KINDS.filter((kind) => !templates.some((t) => t.templateKey === templateKeyOf(kind))),
  }
}

async function getSettings() {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  return NextResponse.json({ data: await view(tenant.htxCode) })
}

async function putSettings(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = zaloSettingsSchema.parse(await jsonBody(request))
  await zaloRepository().saveSettings(tenant.htxCode, {
    enabled: body.enabled,
    kinds: body.kinds,
    quietStartHour: body.quiet_start_hour,
    quietEndHour: body.quiet_end_hour,
    monthlyQuota: body.monthly_quota,
  }, `user:${tenant.userId}`)
  return NextResponse.json({ data: await view(tenant.htxCode) })
}

export const GET = withErrorHandler(getSettings)
export const PUT = withErrorHandler(putSettings)
