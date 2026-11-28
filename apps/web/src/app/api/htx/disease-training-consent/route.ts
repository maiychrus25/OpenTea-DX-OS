// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { PrismaDiseaseConsentRepository } from '@/infrastructure/db/farm/PrismaDiseaseConsentRepository'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ enabled: z.boolean() }).strict()

async function getConsent() {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  return NextResponse.json({ data: await new PrismaDiseaseConsentRepository().get(tenant.htxProfileId) })
}

async function putConsent(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = bodySchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new PrismaDiseaseConsentRepository().set(tenant.htxProfileId, tenant.userId, body.enabled) })
}

export const GET = withErrorHandler(getConsent)
export const PUT = withErrorHandler(putConsent)
