// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase';
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository';
import { TraceView } from './_components/TraceView';

export const runtime = 'nodejs';

const getCachedTrace = cache(async (code: string) => {
  const repo = new PrismaLotTraceRepository();
  const useCase = new GetLotTraceDataUseCase(repo);
  try {
    return await useCase.execute(code);
  } catch (e) {
    const { NotFoundError } = await import('@/domain/errors')
    if (e instanceof NotFoundError) return null
    throw e
  }
});

export async function generateMetadata({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = await params;
  let decoded: string
  try {
    decoded = decodeURIComponent(lot_code).normalize('NFC')
  } catch {
    return {
      title: `Không tìm thấy lô hàng | DX AgriMarket`,
      description: `Mã lô không hợp lệ`,
      robots: { index: false, follow: false },
    }
  }
  if (!decoded || decoded.length > 100 || /[\/\r\n?#]/.test(decoded)) {
    return {
      title: `Không tìm thấy lô hàng | DX AgriMarket`,
      description: `Mã lô không hợp lệ`,
      robots: { index: false, follow: false },
    }
  }
  const data = await getCachedTrace(decoded)
  if (!data) {
    return {
      title: `Không tìm thấy lô hàng | DX AgriMarket`,
      description: `Lô hàng ${decoded} không tồn tại`,
      robots: { index: false, follow: false },
    }
  }
  return {
    title: `Truy xuất ${decoded} | DX AgriMarket`,
    description: `Xem thông tin truy xuất nguồn gốc lô hàng ${decoded}`,
  }
}

export default async function TracePage({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = await params;
  let decoded: string
  try {
    decoded = decodeURIComponent(lot_code).normalize('NFC')
  } catch {
    notFound()
  }
  if (!decoded! || decoded.length > 100 || /[\/\r\n?#]/.test(decoded)) {
    notFound()
  }

  const lotTraceData = await getCachedTrace(decoded!)

  if (!lotTraceData) {
    notFound()
  }

  // Generate QR code as base64 data URI — validated host-aware baseUrl (Host injection guard)
  const QRCode = (await import('qrcode')).default
  const headerList = await headers()
  const { resolveBaseUrlFromHeaders } = await import('@/lib/url-helpers')
  const baseUrl = resolveBaseUrlFromHeaders(headerList, process.env.NEXT_PUBLIC_BASE_URL)
  const pageUrl = `${baseUrl}/lot/${encodeURIComponent(decoded!)}`
  const qrDataUri = await QRCode.toDataURL(pageUrl, { margin: 1, width: 200 }).catch(() => '')

  return (
    <main>
      <TraceView data={lotTraceData} qrDataUri={qrDataUri} pageUrl={pageUrl} />
    </main>
  );
}

