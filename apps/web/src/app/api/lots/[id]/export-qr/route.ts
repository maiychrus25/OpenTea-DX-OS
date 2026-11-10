// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import { assertCertificateKeys } from '@/domain/document/document-namespace'
import { z } from 'zod'

const exportQrSchema = z.object({
  certificate_keys: z.array(z.string()).optional(),
})

async function postExportQr(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer/manager can export QR' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params
  const tenant = await requireTenant()
  await new TenantGuard(tenant).lot(id)

  let certificateKeys: string[] | undefined
  try {
    const body = await request.json()
    const parsed = exportQrSchema.parse(body)
    certificateKeys = parsed.certificate_keys
  } catch (e) {
    // If no body or invalid json, just ignore (certificate_keys is optional)
  }
  assertCertificateKeys(certificateKeys, tenant.htxCode)

  const lotRepo = new PrismaLotRepository()
  const traceRepo = new PrismaLotTraceRepository()
  const storageRepo = new MinioStorageAdapter()
  const docStorageRepo = new MinioDocumentAdapter()
  const useCase = new ExportQrUseCase(lotRepo, traceRepo, storageRepo, docStorageRepo, tenant.htxCode)
  // Hexagonal: baseUrl injected from request headers via validated helper (Host injection guard)
  const { resolveBaseUrlFromHeaders } = await import('@/lib/url-helpers')
  const baseUrl = resolveBaseUrlFromHeaders(request.headers, process.env.NEXT_PUBLIC_BASE_URL)
  const data = await useCase.execute(id, certificateKeys, baseUrl)
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(postExportQr)
