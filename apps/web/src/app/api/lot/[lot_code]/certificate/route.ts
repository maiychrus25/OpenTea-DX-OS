// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { isInDocumentRoot } from '@/domain/document/document-namespace'

/**
 * GET /api/lot/[lot_code]/certificate?key=<minio-key>
 *
 * Public endpoint — no auth required (buyers scan QR without an account).
 * Returns a 302 redirect to a short-lived MinIO presigned URL for the
 * requested certificate document.
 *
 * Authorization: the `key` must be present in lot.certificate_keys[] and sit in the owning HTX's document root.
 * Knowing the key == having implicit read permission (public trace page).
 *
 * Scope: Story 7.9 / Issue #169 — certificate endpoint gap fix.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ lot_code: string }> },
) {
  const { lot_code } = await context.params
  const decoded = decodeURIComponent(lot_code)

  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key || key.trim() === '') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Query param `key` is required.' } },
      { status: 400 },
    )
  }

  // Look up the lot — only QR_EXPORTED lots have public certificates
  const lot = await prisma.lot.findUnique({
    where: { lot_code: decoded },
    select: { status: true, certificate_keys: true, htx_profile: { select: { htx_code: true } } },
  })

  if (!lot) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Lô hàng không tồn tại.' } },
      { status: 404 },
    )
  }

  if (lot.status !== 'QR_EXPORTED') {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Lô hàng chưa được xuất QR.' } },
      { status: 404 },
    )
  }

  // Authorization by inclusion — key must be one of the lot's registered certificates.
  // The namespace check also covers rows written before certificate keys were validated.
  if (!lot.certificate_keys.includes(key) || !lot.htx_profile || !isInDocumentRoot(key, lot.htx_profile.htx_code)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Chứng nhận không thuộc lô hàng này.' } },
      { status: 403 },
    )
  }

  // Generate presigned redirect via MinIO
  try {
    const { MinioStorageAdapter } = await import(
      '@/infrastructure/storage/minio-storage.adapter'
    )
    const storage = new MinioStorageAdapter()
    // Presigned URL valid for 1 hour — sufficient for a buyer to download
    const presignedUrl = await storage.getPresignedUrl(key, 3600)
    return NextResponse.redirect(presignedUrl, { status: 302 })
  } catch {
    // MinIO unavailable — return a descriptive error instead of crashing
    return NextResponse.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Không thể tải chứng nhận lúc này. Vui lòng thử lại sau.',
        },
      },
      { status: 503 },
    )
  }
}
