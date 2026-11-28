// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { auth } from '@/auth';
import { prisma } from '@/infrastructure/db/prisma.client';
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository';
import { GetAllLatestBulletinsUseCase } from '@/application/useCases/GetAllLatestBulletinsUseCase';
import { BulletinView } from '@/components/features/bulletin/BulletinView';
import { EmptyState } from '@/components/ui';
import kit from '@/components/features/farmer-web/kit.module.css';
import { Newspaper } from 'lucide-react';
import styles from './_components/newsroom.module.css';

export const metadata = {
  title: 'Bản tin',
  description: 'Thị trường, thời tiết và kỹ thuật canh tác chè',
}

export default async function FarmerBulletinPage() {
  const repo = new PrismaBulletinRepository(prisma);
  const useCase = new GetAllLatestBulletinsUseCase(repo);

  const htxCode = (await auth())?.user?.htxCode ?? '';
  // The page still opens when the bulletins cannot be read.
  const bulletins = await useCase.execute(htxCode).catch(() => []);

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={kit.hd}>
        <span className={kit.hico}><Newspaper size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Bản tin</h1>
          <p className={kit.sub}>Thị trường, thời tiết và kỹ thuật canh tác chè, từ HTX và nguồn chính thống</p>
        </div>
      </div>

      {bulletins.length === 0
        ? <section className={kit.pn} aria-label="Bản tin"><EmptyState icon={<Newspaper />} title="Chưa có bản tin nào" /></section>
        : bulletins.map(bulletin => <BulletinView key={bulletin.id} bulletin={bulletin} />)}
    </div>
  );
}
