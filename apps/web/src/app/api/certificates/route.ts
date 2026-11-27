// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireRole } from '@/lib/api/route-helpers'
import { certificateFieldsSchema } from '@/lib/validations/certificate.schema'
import { CERTIFICATE_MAX_BYTES, FileRejectedError } from '@/domain/certificate/file-check'
import { CreateCertificate, ListCertificates } from '@/application/certificate/CertificateUseCases'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'

export const dynamic = 'force-dynamic'

// The form fields plus a little slack for multipart framing.
const MAX_BODY_BYTES = CERTIFICATE_MAX_BYTES + 64 * 1024

async function listCertificates() {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  return NextResponse.json({ data: await new ListCertificates(new PrismaCertificateRepository()).execute(tenant) })
}

async function createCertificate(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'officer', 'manager')
  const declared = Number(request.headers.get('content-length'))
  // Refused before the body is read, so a huge upload never reaches memory.
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: 'Tệp lớn hơn 10 MB' } }, { status: 400 })
  }
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Thiếu tệp chứng nhận' } }, { status: 400 })
  }
  const fields: Record<string, string> = {}
  form.forEach((value, key) => { if (key !== 'file' && typeof value === 'string' && value !== '') fields[key] = value })
  const input = certificateFieldsSchema.parse(fields)
  try {
    const view = await new CreateCertificate(new PrismaCertificateRepository(), new MinioDocumentAdapter()).execute(tenant, {
      ...input,
      file: { name: file.name, mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
    })
    return NextResponse.json({ data: view }, { status: 201 })
  } catch (err) {
    if (err instanceof FileRejectedError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 })
    throw err
  }
}

export const GET = withErrorHandler(listCertificates)
export const POST = withErrorHandler(createCertificate)
