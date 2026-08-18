// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient } from '@prisma/client';
import { IBulletinRepository, Bulletin } from '../../../domain/repositories/IBulletinRepository';

export class PrismaBulletinRepository implements IBulletinRepository {
  constructor(private prisma: PrismaClient) {}

  async getLatestBulletin(commodity: string): Promise<Bulletin | null> {
    const record = await this.prisma.bulletin.findFirst({
      where: {
        commodity,
        is_latest: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      commodity: record.commodity,
      bulletin_vi: record.bulletin_vi,
      sources_json: record.sources_json,
      model_used: record.model_used,
      is_latest: record.is_latest,
      created_at: record.created_at,
    };
  }
}
