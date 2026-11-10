// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { prisma } from '@/infrastructure/db/prisma.client';
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository';
import { GetLatestBulletinUseCase } from '@/application/useCases/GetLatestBulletinUseCase';
import { BulletinView } from '@/components/features/bulletin/BulletinView';
import { toEnglishCommodity } from '@/lib/translations';

export const metadata = {
  title: 'Bản tin Thị trường | DX-AgriMarket',
  description: 'Thông tin thị trường nông sản cho nông dân',
}

export default async function FarmerBulletinPage({
  searchParams,
}: {
  searchParams: { commodity?: string };
}) {
  const commodity = searchParams.commodity || 'Chè';
  
  const repo = new PrismaBulletinRepository(prisma);
  const useCase = new GetLatestBulletinUseCase(repo);
  
  const bulletin = await useCase.execute(toEnglishCommodity(commodity));

  return (
    <div>
      {bulletin ? (
        <BulletinView bulletin={bulletin} />
      ) : (
        <p>Chưa có bản tin mới cho nông sản: {commodity}</p>
      )}
    </div>
  );
}
