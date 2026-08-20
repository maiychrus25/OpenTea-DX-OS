// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { GetNotificationsUseCase } from '@/application/notification/get-notifications-usecase'
import { MarkNotificationReadUseCase } from '@/application/notification/mark-notification-read-usecase'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const notificationRepo = new PrismaNotificationRepository()
const getNotificationsUseCase = new GetNotificationsUseCase(notificationRepo)
const markNotificationReadUseCase = new MarkNotificationReadUseCase(notificationRepo)

const getQuerySchema = z.object({
  limit: z.coerce.number().min(1).default(5).catch(5),
  filter: z.string().optional()
})

const putBodySchema = z.object({
  id: z.string().optional(),
  action: z.enum(['mark-read', 'mark-all-read', 'update-preferences']).default('mark-read'),
  preferences: z.record(z.unknown()).optional()
})

async function getNotifications(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const validationResult = getQuerySchema.safeParse({ limit: searchParams.get('limit'), filter: searchParams.get('filter') })
  const limit = validationResult.success ? validationResult.data.limit : 5
  const filter = validationResult.success ? validationResult.data.filter : undefined

  const result = await getNotificationsUseCase.execute(session.user.id, limit, filter)
  return NextResponse.json({ data: result }, { status: 200 })
}

export const GET = withErrorHandler(getNotifications)

async function putNotifications(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const validationResult = putBodySchema.safeParse(body)
  
  if (!validationResult.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } }, { status: 400 })
  }
  
  const { id, action, preferences } = validationResult.data

  if (action === 'mark-all-read') {
    await markNotificationReadUseCase.execute(session.user.id)
  } else if (action === 'mark-read' && id) {
    await markNotificationReadUseCase.execute(session.user.id, id)
  } else if (action === 'update-preferences') {
    await notificationRepo.updatePreferences(session.user.id, preferences)
  }

  return NextResponse.json({ data: { success: true } }, { status: 200 })
}

export const PUT = withErrorHandler(putNotifications)

async function deleteNotifications(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id is required' } }, { status: 400 })
  }

  await notificationRepo.delete(session.user.id, id)
  return NextResponse.json({ data: { success: true } }, { status: 200 })
}

export const DELETE = withErrorHandler(deleteNotifications)
