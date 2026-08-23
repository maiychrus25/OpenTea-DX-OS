// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ApproveHarvestUseCase } from '@/application/farm/ApproveHarvestUseCase';
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository';
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository';
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository';
import { DomainError } from '@/domain/errors/DomainError';
import { ForbiddenError } from '@/domain/errors/ForbiddenError';
import { NotFoundError } from '@/domain/errors/NotFoundError';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const role = session.user.role?.toLowerCase() || '';

    const useCase = new ApproveHarvestUseCase(
      new PrismaParcelRepository(),
      new PrismaJournalRepository(),
      new PrismaNotificationRepository()
    );

    const userId = session.user.id || '';
    const parcel = await useCase.execute(id, userId, role);

    return NextResponse.json({ parcel }, { status: 200 });
  } catch (error: any) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('ApproveHarvest error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
