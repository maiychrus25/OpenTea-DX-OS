// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { notFound } from 'next/navigation';
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase';
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository';
import { TraceView } from './_components/TraceView';

export async function generateMetadata({ params }: { params: { lot_code: string } }) {
  return {
    title: `Truy xuất ${params.lot_code} | DX AgriMarket`,
    description: `Xem thông tin truy xuất nguồn gốc lô hàng ${params.lot_code}`,
  };
}

export default async function TracePage({ params }: { params: { lot_code: string } }) {
  const { lot_code } = params;
  
  const lotRepo = new PrismaLotTraceRepository();
  const useCase = new GetLotTraceDataUseCase(lotRepo);
  
  const lotTraceData = await useCase.execute(lot_code).catch(() => null);
  
  if (!lotTraceData) {
    notFound();
  }

  return (
    <main>
      <TraceView data={lotTraceData} />
    </main>
  );
}
