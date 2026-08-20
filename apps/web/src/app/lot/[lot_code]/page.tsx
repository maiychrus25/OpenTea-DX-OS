// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { notFound } from 'next/navigation';
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase';
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository';
import { TraceView } from './_components/TraceView';

export async function generateMetadata({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = await params;
  const decoded = decodeURIComponent(lot_code);
  return {
    title: `Truy xuất ${decoded} | DX AgriMarket`,
    description: `Xem thông tin truy xuất nguồn gốc lô hàng ${decoded}`,
  };
}

export default async function TracePage({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = await params;
  const decoded = decodeURIComponent(lot_code);

  const lotRepo = new PrismaLotTraceRepository();
  const useCase = new GetLotTraceDataUseCase(lotRepo);

  const lotTraceData = await useCase.execute(decoded).catch(() => null);

  if (!lotTraceData) {
    notFound();
  }

  // Generate QR code as base64 data URI
  const QRCode = (await import('qrcode')).default;
  const pageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/lot/${encodeURIComponent(decoded)}`;
  const qrDataUri = await QRCode.toDataURL(pageUrl, { margin: 1, width: 200 }).catch(() => '');

  return (
    <main>
      <TraceView data={lotTraceData} qrDataUri={qrDataUri} pageUrl={pageUrl} />
    </main>
  );
}

