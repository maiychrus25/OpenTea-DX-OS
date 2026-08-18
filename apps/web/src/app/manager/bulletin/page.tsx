// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { prisma } from '@/infrastructure/db/prisma.client';
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository';
import { GetLatestBulletinUseCase } from '@/application/useCases/GetLatestBulletinUseCase';
import { BulletinView } from '@/components/features/bulletin/BulletinView';
import { MarketSummaryWidget } from '@/components/features/market/MarketSummaryWidget';

export default async function ManagerBulletinPage({
  searchParams,
}: {
  searchParams: { commodity?: string };
}) {
  const commodity = searchParams.commodity || 'Gạo';
  
  const repo = new PrismaBulletinRepository(prisma);
  const useCase = new GetLatestBulletinUseCase(repo);
  
  const bulletin = await useCase.execute(commodity);

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 60%' }}>
        {bulletin ? (
          <BulletinView bulletin={bulletin} />
        ) : (
          <p>Chưa có bản tin nào cho nông sản: {commodity}</p>
        )}
      </div>
      <div style={{ flex: '1 1 30%', minWidth: '300px' }}>
        <MarketSummaryWidget />
      </div>
    </div>
  );
}
