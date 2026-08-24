// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { GetNotificationsUseCase } from '@/application/notification/get-notifications-usecase'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { logger } from '@/lib/logger'
import { sseEmitter, SSE_EVENTS } from '@/lib/sse-emitter'

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const userId = session.user.id

  const encoder = new TextEncoder()
  const customReadable = new ReadableStream({
    start(controller) {
      const notificationRepo = new PrismaNotificationRepository()
      const getNotificationsUseCase = new GetNotificationsUseCase(notificationRepo)

      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connection established' })}\n\n`))

      const sendLatestNotification = async () => {
        try {
          const result = await getNotificationsUseCase.execute(userId, 1, 'unread')
          if (result.notifications.length > 0) {
            controller.enqueue(encoder.encode(`event: notification\ndata: ${JSON.stringify(result.notifications[0])}\n\n`))
          }
        } catch (error) {
          logger.error('SSE Error:', { error })
        }
      };

      type NotificationPayload = { broadcast?: boolean; userId?: string };
      const handleNewNotification = (data: NotificationPayload) => {
        if (data.broadcast || data.userId === userId) {
          sendLatestNotification();
        }
      };

      sseEmitter.on(SSE_EVENTS.NEW_NOTIFICATION, handleNewNotification);

      // Keep a fallback polling interval for resilience
      const intervalId = setInterval(sendLatestNotification, 30000);

      req.signal.addEventListener('abort', () => {
        sseEmitter.off(SSE_EVENTS.NEW_NOTIFICATION, handleNewNotification);
        clearInterval(intervalId);
        controller.close();
      })
    }
  })

  return new NextResponse(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
