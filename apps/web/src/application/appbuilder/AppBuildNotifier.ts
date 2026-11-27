// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AppBuild, AppBuildRequest } from '@/domain/appbuilder/app-build'
import { SCREENSHOT_NAMES } from '@/domain/appbuilder/app-build'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import { logger } from '@/lib/logger'
import { APP_REQUEST_TEXT } from './messages'

const ANSWER_WINDOW_MS = 24 * 60 * 60 * 1000

/** What the requester reads on Telegram. A failure is logged and never fails the request flow. */
export class AppBuildNotifier {
  constructor(private readonly repo: Pick<TelegramRepository, 'activeUserLinkByUser' | 'enqueue' | 'setAppAnswer'>) {}

  /** One message with the questions, and a 24 h conversation so the manager's next text is the answer. */
  async questionsAsked(request: AppBuildRequest, questions: string[], now: Date = new Date()): Promise<void> {
    try {
      const link = await this.repo.activeUserLinkByUser(request.requestedBy)
      if (!link?.telegramUserId) return
      await this.repo.setAppAnswer({ telegramUserId: link.telegramUserId, requestId: request.id, expiresAt: new Date(now.getTime() + ANSWER_WINDOW_MS) })
      await this.repo.enqueue([
        { htxCode: request.htxCode, chatId: link.chatId, op: 'send', text: APP_REQUEST_TEXT.questions(request.requestText.slice(0, 60), questions), purpose: 'reply' },
      ])
    } catch (err) {
      logger.error('App builder: could not queue the questions', { requestId: request.id, err })
    }
  }

  /** The success message with the four screenshots, or the failure message. */
  async finished(request: AppBuildRequest, build: AppBuild | null): Promise<void> {
    try {
      const link = await this.repo.activeUserLinkByUser(request.requestedBy)
      if (!link) return
      const name = typeof request.spec?.name_vi === 'string' ? request.spec.name_vi : (request.appId ?? 'mới')
      const passed = request.status === 'passed'
      await this.repo.enqueue([
        {
          htxCode: request.htxCode,
          chatId: link.chatId,
          op: 'send',
          text: passed ? APP_REQUEST_TEXT.built(name) : APP_REQUEST_TEXT.buildFailed(name, request.errorVi ?? 'không rõ lý do'),
          purpose: 'result',
          photos: passed && build ? SCREENSHOT_NAMES.map((n) => ({ build_id: build.id, name: n })) : null,
        },
      ])
    } catch (err) {
      logger.error('App builder: could not queue the result message', { requestId: request.id, err })
    }
  }
}
