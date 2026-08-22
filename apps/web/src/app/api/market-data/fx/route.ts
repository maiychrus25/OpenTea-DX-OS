// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db/prisma.client';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const fxData = await prisma.fxRate.findMany({
    orderBy: {
      fetched_at: 'desc'
    },
    take: 1
  });

  return NextResponse.json({ data: fxData });
}
