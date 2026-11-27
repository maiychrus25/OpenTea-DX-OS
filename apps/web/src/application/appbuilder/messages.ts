// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export const APP_REQUEST_TEXT = {
  received: 'Đã nhận yêu cầu. Trợ lý sẽ hỏi lại vài câu nếu cần.',
  active: 'HTX đang có một yêu cầu xây app chưa xong.',
  tooLong: 'Yêu cầu dài quá 500 ký tự. Hãy viết ngắn hơn.',
  answerReceived: 'Đã nhận câu trả lời. Trợ lý sẽ viết đặc tả app.',
  answerClosed: 'Yêu cầu này không còn chờ câu trả lời.',
  answerTooLong: 'Câu trả lời dài quá 1000 ký tự. Hãy viết ngắn hơn.',
  questions: (name: string, questions: string[]) =>
    [`Trợ lý cần hỏi thêm về yêu cầu "${name}":`, ...questions.map((q, i) => `${i + 1}. ${q}`), 'Trả lời bằng một tin nhắn. Gõ /huy để bỏ qua.'].join('\n'),
  built: (name: string) => `App "${name}" đã xây xong, qua 7 cổng kiểm tra.`,
  buildFailed: (name: string, errorVi: string) => `Chưa xây được app "${name}": ${errorVi}. Yêu cầu đã đóng.`,
} as const
