// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant } from '@/lib/api/tenant';
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter';
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository';
import { BroadcastAnnouncementUseCase } from '@/application/notification/broadcast-announcement-usecase';
import { withErrorHandler } from '@/lib/api/withErrorHandler';

const notificationRepo = new PrismaNotificationRepository();
const broadcastAnnouncementUseCase = new BroadcastAnnouncementUseCase(notificationRepo);

const announceSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
});

async function postAnnounce(req: Request) {
  const tenant = await requireTenant();

  if (tenant.role !== 'officer' && tenant.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const validationResult = announceSchema.safeParse(body);
  
  if (!validationResult.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: validationResult.error.errors[0].message } }, { status: 400 });
  }
  
  const { title, body: announcementBody } = validationResult.data;

  const adapter = new KeycloakAdminAdapter();
  const members = await Promise.all(
    ['farmer', 'officer', 'manager'].map((role) => adapter.listUsersByRole(role, tenant.htxCode))
  );
  const recipientIds = Array.from(new Set(members.flat().map((member) => member.id)));

  await broadcastAnnouncementUseCase.execute(title, announcementBody, tenant.userId, recipientIds);

  return NextResponse.json({ data: { success: true } }, { status: 201 });
}

export const POST = withErrorHandler(postAnnounce);
