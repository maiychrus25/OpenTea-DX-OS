// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db/prisma.client';
import { toEnglishCommodity } from '@/lib/translations';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const url = new URL(request.url);
  const commodityVi = url.searchParams.get('commodity') || 'Gạo';
  const dbCommodity = toEnglishCommodity(commodityVi);

  // Priority: export_value_to_world > cereal_production > cereal_yield > first available
  const PRIORITY_METRICS: Record<string, string[]> = {
    'Rice':                   ['export_value_to_world', 'export_volume_to_world'],
    'Coffee':                 ['export_value_to_world', 'export_volume_to_world'],
    'Pepper':                 ['export_value_to_world', 'export_volume_to_world'],
    'Cassava':                ['export_value_to_world', 'export_volume_to_world'],
    'Rubber':                 ['export_value_to_world', 'export_volume_to_world'],
    'Cereals':                ['cereal_production', 'cereal_yield'],
    'Agricultural Products':  ['export_value_to_world', 'export_volume_to_world'],
    'Agricultural Products (VN)': ['export_value_to_world', 'export_volume_to_world'],
    'Climate':                ['yield_kg_per_ha'],
  };

  const priorityMetrics = PRIORITY_METRICS[dbCommodity] || [];

  let marketData = null;

  for (const metric of priorityMetrics) {
    const found = await prisma.marketData.findFirst({
      where: { commodity: dbCommodity, metric },
      orderBy: { fetched_at: 'desc' },
    });
    if (found) { marketData = found; break; }
  }

  // Fallback: any latest row
  if (!marketData) {
    marketData = await prisma.marketData.findFirst({
      where: { commodity: dbCommodity },
      orderBy: { fetched_at: 'desc' },
    });
  }

  return NextResponse.json({ data: marketData ? [marketData] : [] });
}
