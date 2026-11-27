// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppBuildError, type AppBuildRepository, type AppBuildRequest } from '@/domain/appbuilder/app-build'
import { ValidationError } from '@/domain/errors'
import { APP_REQUEST_TEXT } from './messages'

export const REQUEST_TEXT_MIN = 5
export const REQUEST_TEXT_MAX = 500
export const ANSWER_TEXT_MAX = 1000

export interface Requester {
  htxCode: string
  userId: string
  userName: string | null
}

/** A manager's side of a request: write it, answer the questions, drop it. The web and the chat share it. */
export class AppRequestIntake {
  constructor(private readonly repo: AppBuildRepository) {}

  async create(requester: Requester, text: string): Promise<AppBuildRequest> {
    const requestText = text.trim()
    if (requestText.length < REQUEST_TEXT_MIN || requestText.length > REQUEST_TEXT_MAX) {
      throw new ValidationError('Yêu cầu cần từ 5 đến 500 ký tự')
    }
    return this.repo.create({ htxCode: requester.htxCode, requestedBy: requester.userId, requestedByName: requester.userName, requestText })
  }

  /** The reply to a sentence a manager sent in chat. */
  async submitFromChat(requester: Requester, text: string): Promise<string> {
    if (text.trim().length > REQUEST_TEXT_MAX) return APP_REQUEST_TEXT.tooLong
    try {
      await this.create(requester, text)
      return APP_REQUEST_TEXT.received
    } catch (err) {
      if (err instanceof AppBuildError && err.code === 'REQUEST_ACTIVE') return APP_REQUEST_TEXT.active
      throw err
    }
  }

  /** Stores the answer of an `asking` request; false when the request no longer waits for one. */
  async answer(htxCode: string, id: string, text: string): Promise<boolean> {
    const answerText = text.trim()
    if (!answerText || answerText.length > ANSWER_TEXT_MAX) throw new ValidationError('Câu trả lời cần từ 1 đến 1000 ký tự')
    return this.repo.setAnswer(htxCode, id, answerText)
  }

  /** The Telegram answer: a reply text for the user, and whether the conversation is over. */
  async answerFromChat(htxCode: string, id: string, text: string): Promise<{ reply: string; done: boolean }> {
    if (text.trim().length > ANSWER_TEXT_MAX) return { reply: APP_REQUEST_TEXT.answerTooLong, done: false }
    const stored = await this.answer(htxCode, id, text)
    return { reply: stored ? APP_REQUEST_TEXT.answerReceived : APP_REQUEST_TEXT.answerClosed, done: true }
  }

  async cancel(htxCode: string, id: string): Promise<void> {
    if (!(await this.repo.cancel(htxCode, id))) throw new AppBuildError('WRONG_STATE', 'Yêu cầu không thể huỷ ở bước này')
  }
}
