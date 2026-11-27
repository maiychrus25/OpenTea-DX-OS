// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { PrismaPublicSettingsRepository } from '@/infrastructure/db/farm/PrismaPublicSettingsRepository'

export const dynamic = 'force-dynamic'

const settingsSchema = z.object({ public_show_names: z.boolean() }).strict()

async function getSettings() {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager', 'officer')
  return NextResponse.json({ data: await new PrismaPublicSettingsRepository().getPublicSettings(tenant.htxProfileId) })
}

async function putSettings(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = settingsSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new PrismaPublicSettingsRepository().setPublicShowNames(tenant.htxProfileId, tenant.userId, body.public_show_names) })
}

export const GET = withErrorHandler(getSettings)
export const PUT = withErrorHandler(putSettings)
