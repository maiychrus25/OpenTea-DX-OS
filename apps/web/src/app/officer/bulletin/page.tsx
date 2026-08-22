// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { prisma } from '@/infrastructure/db/prisma.client';
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository';
import { GetLatestBulletinUseCase } from '@/application/useCases/GetLatestBulletinUseCase';
import { GetAvailableCommoditiesUseCase } from '@/application/useCases/GetAvailableCommoditiesUseCase';
import { BulletinView } from '@/components/features/bulletin/BulletinView';
import { MarketSummaryWidget } from '@/components/features/market/MarketSummaryWidget';
import { CommodityTabs } from '@/components/features/bulletin/CommodityTabs';

import { toEnglishCommodity, toVietnameseCommodity } from '@/lib/translations';

export const dynamic = 'force-dynamic';

export default async function OfficerBulletinPage({
  searchParams,
}: {
  searchParams: { commodity?: string };
}) {
  const repo = new PrismaBulletinRepository(prisma);
  const getCommodities = new GetAvailableCommoditiesUseCase(repo);
  const getBulletin = new GetLatestBulletinUseCase(repo);
  
  const availableCommodities = await getCommodities.execute();
  
  const commodityVi = searchParams.commodity || (availableCommodities.length > 0 ? toVietnameseCommodity(availableCommodities[0]) : 'Gạo');
  const dbCommodity = toEnglishCommodity(commodityVi);
  
  const bulletin = await getBulletin.execute(dbCommodity);

  return (
    <div className="flex flex-col gap-6">
      <CommodityTabs availableCommodities={availableCommodities} basePath="/officer/bulletin" />
      
      <div className="flex gap-8 flex-wrap items-start">
        <div className="flex-[1_1_60%]">
          {bulletin ? (
            <BulletinView bulletin={bulletin} />
          ) : (
            <p>Chưa có bản tin nào cho nông sản: {commodityVi}</p>
          )}
        </div>
        <div className="flex-[1_1_30%] min-w-[300px]">
          <MarketSummaryWidget commodity={commodityVi} />
        </div>
      </div>
    </div>
  );
}
