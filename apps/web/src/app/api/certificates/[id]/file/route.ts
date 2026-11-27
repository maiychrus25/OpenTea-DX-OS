// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { paramOf, requireRole } from '@/lib/api/route-helpers'
import { CertificateFileUrl } from '@/application/certificate/CertificateUseCases'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'

export const dynamic = 'force-dynamic'

async function openFile(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const id = await paramOf(context)
  await new TenantGuard(tenant).certificate(id)
  const url = await new CertificateFileUrl(new PrismaCertificateRepository(), new MinioDocumentAdapter()).execute(tenant, id)
  return NextResponse.redirect(url, 302)
}

export const GET = withErrorHandler(openFile)
