// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient } from '@prisma/client';
import { IBulletinRepository, Bulletin, PublishBulletinRecord } from '../../../domain/repositories/IBulletinRepository';

// Only published rows, and only the cooperative's own rows or the shared ones (htx_code null) from n8n.
function visibleTo(htxCode: string) {
  return { status: 'published', OR: [{ htx_code: htxCode }, { htx_code: null }] };
}

type BulletinRecord = {
  id: string;
  commodity: string;
  bulletin_vi: string;
  sources_json: unknown;
  model_used: string;
  is_latest: boolean;
  created_at: Date;
};

function toBulletin(record: BulletinRecord): Bulletin {
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

export class PrismaBulletinRepository implements IBulletinRepository {
  constructor(private prisma: PrismaClient) {}

  async getLatestBulletin(commodity: string, htxCode: string): Promise<Bulletin | null> {
    // Nulls last puts the cooperative's own row before a shared one; then the newest first.
    const record = await this.prisma.bulletin.findFirst({
      where: {
        commodity,
        is_latest: true,
        ...visibleTo(htxCode),
      },
      orderBy: [{ htx_code: { sort: 'desc', nulls: 'last' } }, { created_at: 'desc' }],
    });

    return record ? toBulletin(record) : null;
  }

  async getAllLatestBulletins(htxCode: string): Promise<Bulletin[]> {
    const records = await this.prisma.bulletin.findMany({
      where: {
        is_latest: true,
        ...visibleTo(htxCode),
      },
      orderBy: [{ htx_code: { sort: 'desc', nulls: 'last' } }, { created_at: 'desc' }],
    });

    // The first row of each commodity is the cooperative's own when it has one.
    const seen = new Set<string>();
    const latest: Bulletin[] = [];
    for (const record of records) {
      if (seen.has(record.commodity)) continue;
      seen.add(record.commodity);
      latest.push(toBulletin(record));
    }
    return latest;
  }

  async getAvailableCommodities(htxCode: string): Promise<string[]> {
    const records = await this.prisma.bulletin.findMany({
      where: {
        is_latest: true,
        ...visibleTo(htxCode),
      },
      select: {
        commodity: true,
      },
      distinct: ['commodity'],
    });

    return records.map((r) => r.commodity);
  }

  async publish(htxCode: string, record: PublishBulletinRecord): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.bulletin.updateMany({
        where: { htx_code: htxCode, commodity: record.commodity, is_latest: true },
        data: { is_latest: false },
      });
      const created = await tx.bulletin.create({
        data: {
          commodity: record.commodity,
          bulletin_vi: record.bulletinVi,
          sources_json: record.sources,
          model_used: record.modelUsed,
          is_latest: true,
          status: 'published',
          htx_code: htxCode,
        },
        select: { id: true },
      });
      return { id: created.id };
    });
  }
}
