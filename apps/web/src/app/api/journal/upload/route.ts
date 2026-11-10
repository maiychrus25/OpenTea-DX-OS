// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ForbiddenError } from '@/domain/errors'
import { assertJournalPhotoKey, journalPhotoRoot } from '@/domain/document/document-namespace'
import { localDay } from '@/domain/shared/local-day'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const UPLOAD_SECONDS = 900

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

/** The last path segment, Vietnamese letters without marks, and the character set the document upload keeps. */
function safeFileName(filename: string, contentType: keyof typeof EXTENSIONS): string {
  const safe = (filename.split(/[\\/]/).pop() ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\.{2,}/g, '.')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .slice(-100) // the tail keeps the extension
  return /[a-zA-Z0-9]/.test(safe) ? safe : `photo.${EXTENSIONS[contentType]}`
}

async function createUploadUrl(req: Request) {
  const { role, htxCode } = await requireTenant()
  if (role !== 'farmer' && role !== 'officer') throw new ForbiddenError('Only officer/farmer can upload journal photos')

  const body = await req.json().catch(() => ({}))
  const parse = uploadSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })
  }

  const year = localDay(new Date()).slice(0, 4)
  const key = `${journalPhotoRoot(htxCode)}${year}/${randomUUID()}-${safeFileName(parse.data.filename, parse.data.contentType)}`
  // POST /api/journal accepts only keys that pass this check, so a key that would fail it is never signed.
  assertJournalPhotoKey(key, htxCode)

  // shortcut: a presigned PUT signs only the host, so the content type is checked here but not bound to the URL; bind it with a POST policy if uploads must be type-locked.
  const { url } = await new MinioDocumentAdapter().generateUploadUrl(key, UPLOAD_SECONDS)
  return NextResponse.json({ data: { uploadUrl: url, key } })
}

export const POST = withErrorHandler(createUploadUrl)
