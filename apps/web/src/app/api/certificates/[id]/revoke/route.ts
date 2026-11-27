// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { certificateRevokeSchema } from '@/lib/validations/certificate.schema'
import { RevokeCertificate } from '@/application/certificate/CertificateUseCases'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'

async function revoke(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const id = await paramOf(context)
  const { reason } = certificateRevokeSchema.parse(await jsonBody(request))
  await new TenantGuard(tenant).certificate(id)
  return NextResponse.json({ data: await new RevokeCertificate(new PrismaCertificateRepository()).execute(tenant, id, reason) })
}

export const POST = withErrorHandler(revoke)
