// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { GetNotificationsUseCase } from '@/application/notification/get-notifications-usecase'
import { MarkNotificationReadUseCase } from '@/application/notification/mark-notification-read-usecase'
import { z } from 'zod'

const notificationRepo = new PrismaNotificationRepository()
const getNotificationsUseCase = new GetNotificationsUseCase(notificationRepo)
const markNotificationReadUseCase = new MarkNotificationReadUseCase(notificationRepo)

const getQuerySchema = z.object({
  limit: z.coerce.number().min(1).default(5).catch(5)
})

const putBodySchema = z.object({
  id: z.string().optional()
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const validationResult = getQuerySchema.safeParse({ limit: searchParams.get('limit') })
  const limit = validationResult.success ? validationResult.data.limit : 5

  try {
    const notifications = await getNotificationsUseCase.execute(session.user.id, limit)
    return NextResponse.json({ notifications }, { status: 200 })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const validationResult = putBodySchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    
    const id = validationResult.data.id

    await markNotificationReadUseCase.execute(session.user.id, id)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error marking notification(s) read:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
