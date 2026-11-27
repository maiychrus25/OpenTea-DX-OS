// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { auth } from '@/auth';
import { prisma } from '@/infrastructure/db/prisma.client';
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository';
import { GetLatestBulletinUseCase } from '@/application/useCases/GetLatestBulletinUseCase';
import { BulletinView } from '@/components/features/bulletin/BulletinView';
import { WeatherSection } from '@/components/features/bulletin/WeatherSection';
import { SampleTag } from '@/components/features/sample/SampleTag';
import kit from '@/components/features/farmer-web/kit.module.css';
import { toEnglishCommodity } from '@/lib/translations';
import { Newsroom } from './_components/Newsroom';
import styles from './_components/newsroom.module.css';

export const metadata = {
  title: 'Bản tin',
  description: 'Thị trường, thời tiết và kỹ thuật canh tác chè',
}

export default async function FarmerBulletinPage({
  searchParams,
}: {
  searchParams: { commodity?: string };
}) {
  const commodity = searchParams.commodity || 'Chè';

  const repo = new PrismaBulletinRepository(prisma);
  const useCase = new GetLatestBulletinUseCase(repo);

  const htxCode = (await auth())?.user?.htxCode ?? '';
  // The page still opens when the market bulletin cannot be read.
  const bulletin = await useCase.execute(toEnglishCommodity(commodity), htxCode).catch(() => null);

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={styles.head}>
        <div>
          <h1>Bản tin <SampleTag /></h1>
          <p>Thị trường, thời tiết và kỹ thuật canh tác chè, từ HTX và nguồn chính thống</p>
        </div>
      </div>

      <Newsroom />

      {bulletin && <BulletinView bulletin={bulletin} />}

      <div id="du-bao">
        <WeatherSection collapsed />
      </div>
    </div>
  );
}
