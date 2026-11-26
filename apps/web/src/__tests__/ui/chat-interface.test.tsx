// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { TextDecoder, TextEncoder } from 'util'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { redirectToLogin } from '@/lib/api/redirect-to-login'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'
import { readChatStream, stripThinking } from '@/components/ui/chat-interface/chat-stream'

jest.mock('@/lib/api/redirect-to-login', () => ({ redirectToLogin: jest.fn() }))
Object.assign(global, { TextDecoder, TextEncoder })
const encoder = new TextEncoder()
const sessions = [{ session_id: 'saved', title: 'Hội thoại đã lưu', updated_at: '2026-11-25T10:00:00Z' }]
const jsonResponse = (data: object) => ({ ok: true, json: async () => ({ data }) })
let postResponse: object
let historyResponse: object
let signal: AbortSignal | undefined

function streamResponse(chunks: string[], failure = false) {
  const read = jest.fn()
  chunks.forEach(chunk => read.mockResolvedValueOnce({ done: false, value: encoder.encode(chunk) }))
  if (failure) read.mockRejectedValueOnce(new Error('offline'))
  else read.mockResolvedValue({ done: true })
  return { ok: true, body: { getReader: () => ({ read, cancel: jest.fn().mockResolvedValue(undefined), releaseLock: jest.fn() }) } }
}

function send(text = 'Giá chè hôm nay?') {
  fireEvent.change(screen.getByPlaceholderText('Hỏi trợ lý…'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  signal = undefined
  postResponse = streamResponse(['{"text":"Trả lời mẫu"}\n{"done":true,"sources":["USDA"]}\n'])
  historyResponse = jsonResponse({ history: [{ role: 'assistant', content: '<think>Bí mật</think>Nội dung đã lưu' }] })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      signal = init.signal as AbortSignal
      return postResponse
    }
    return url.includes('/sessions') ? jsonResponse({ sessions }) : historyResponse
  }) as jest.Mock
  window.HTMLDialogElement.prototype.close = jest.fn()
  window.HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) { this.open = true })
  window.HTMLElement.prototype.scrollTo = jest.fn()
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })
})

/** Opens the history panel and returns queries scoped to it. */
async function openHistory() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lịch sử' })) })
  return within(screen.getByRole('dialog', { name: 'Lịch sử trò chuyện' }))
}

describe('ChatInterface', () => {
  it.each([
    ['manager', 'Trợ lý Thị trường'],
    ['officer', 'Trợ lý Kỹ thuật'],
  ] as const)('renders the %s title and an empty greeting', async (role, title) => {
    render(<ChatInterface role={role} />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText('Hôm nay bạn đang nghĩ gì?')).toBeInTheDocument()
  })

  it('filters past titles locally in the history panel', async () => {
    render(<ChatInterface role="manager" />)
    const panel = await openHistory()
    await panel.findByRole('button', { name: 'Hội thoại đã lưu' })
    const requests = (fetch as jest.Mock).mock.calls.length
    const search = panel.getByRole('searchbox', { name: 'Tìm trong lịch sử' })
    fireEvent.change(search, { target: { value: 'không khớp' } })
    expect(panel.queryByRole('button', { name: 'Hội thoại đã lưu' })).not.toBeInTheDocument()
    expect(panel.getByText('Không tìm thấy cuộc trò chuyện')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '  HỘI THOẠI  ' } })
    expect(panel.getByRole('button', { name: 'Hội thoại đã lưu' })).toBeInTheDocument()
    expect((fetch as jest.Mock).mock.calls).toHaveLength(requests)
  })

  it('lets officers switch between the two assistants, but not managers', () => {
    const view = render(<ChatInterface role="officer" />)
    const switcher = within(screen.getByRole('navigation', { name: 'Chọn trợ lý' }))
    expect(switcher.getByRole('link', { name: 'Kỹ thuật' })).toHaveAttribute('aria-current', 'page')
    expect(switcher.getByRole('link', { name: 'Thị trường' })).toHaveAttribute('href', '/officer/assistant')
    view.unmount()
    render(<ChatInterface role="manager" />)
    expect(screen.queryByRole('navigation', { name: 'Chọn trợ lý' })).not.toBeInTheDocument()
  })

  it('keeps the empty-history label', async () => {
    ;(fetch as jest.Mock).mockResolvedValue(jsonResponse({ sessions: [] }))
    render(<ChatInterface role="manager" />)
    expect(await (await openHistory()).findByText('Chưa có lịch sử trò chuyện')).toBeInTheDocument()
  })

  it('buffers split JSON lines, hides split think tags and flushes the last line', async () => {
    postResponse = streamResponse(['{"te', 'xt":"<thi"}\n{"text":"nk>Ẩn</think>Giá ', 'chè"}\n{"done":true,"sources":["USDA"]}'])
    render(<ChatInterface role="manager" />)
    send()
    expect(await screen.findByText('Giá chè')).toBeInTheDocument()
    expect(await screen.findByText('USDA')).toBeInTheDocument()
    expect(screen.queryByText(/Ẩn|<thi/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gửi' })).toBeInTheDocument())
  })

  it('renders a connection error once after partial output', async () => {
    postResponse = streamResponse(['{"text":"Một phần"}\n'], true)
    render(<ChatInterface role="manager" />)
    send()
    await screen.findByText(/Không thể kết nối tới AI/)
    expect(document.querySelectorAll('[class*="botMessage"]')).toHaveLength(1)
  })

  it('treats a stream error as terminal, without appending later text', async () => {
    postResponse = streamResponse(['{"error":true,"message":"Dịch vụ đang bận"}\n{"text":"Không được hiện"}\n'])
    render(<ChatInterface role="manager" />)
    send()
    expect(await screen.findByText('Dịch vụ đang bận')).toBeInTheDocument()
    expect(screen.queryByText('Không được hiện')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[class*="botMessage"]')).toHaveLength(1)
  })

  it('stops an active stream and ignores a late chunk', async () => {
    let resolveRead!: (value: object) => void
    const read = jest.fn().mockResolvedValueOnce({ done: false, value: encoder.encode('{"text":"Đang trả lời"}\n') })
      .mockImplementation(() => new Promise(resolve => { resolveRead = resolve }))
    postResponse = { ok: true, body: { getReader: () => ({ read, cancel: jest.fn().mockResolvedValue(undefined), releaseLock: jest.fn() }) } }
    render(<ChatInterface role="manager" />)
    send()
    await screen.findByText('Đang trả lời')
    fireEvent.click(screen.getByRole('button', { name: 'Dừng trả lời' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => resolveRead({ done: false, value: encoder.encode('{"text":"Rò rỉ"}\n') }))
    expect(screen.queryByText(/Rò rỉ/)).not.toBeInTheDocument()
    expect(screen.getByText('Đang trả lời')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeInTheDocument()
  })

  it.each(['new', 'saved'])('isolates a pending answer when switching to %s', async destination => {
    let resolvePost!: (value: object) => void
    const pending = new Promise(resolve => { resolvePost = resolve })
    ;(fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { signal = init.signal as AbortSignal; return pending }
      return url.includes('/sessions') ? jsonResponse({ sessions }) : historyResponse
    })
    render(<ChatInterface role="manager" />)
    send()
    if (destination === 'saved') await openHistory()
    fireEvent.click(await screen.findByRole('button', { name: destination === 'new' ? 'Trò chuyện mới' : 'Hội thoại đã lưu' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => resolvePost(streamResponse(['{"text":"Rò rỉ"}\n'])))
    expect(screen.queryByText('Rò rỉ')).not.toBeInTheDocument()
    if (destination === 'saved') {
      expect(await screen.findByText('Nội dung đã lưu')).toBeInTheDocument()
      expect(screen.queryByText(/Bí mật/)).not.toBeInTheDocument()
    } else expect(screen.getByText('Hôm nay bạn đang nghĩ gì?')).toBeInTheDocument()
  })

  it('does not send Enter during IME or Shift+Enter, but sends plain Enter', async () => {
    render(<ChatInterface role="officer" />)
    const input = screen.getByPlaceholderText('Hỏi trợ lý…')
    fireEvent.change(input, { target: { value: 'Chè' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect((fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Trả lời mẫu')
    const [, request] = (fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(request.body).type).toBe('technical')
  })

  it('redirects a 401 answer to login', async () => {
    postResponse = { ok: false, status: 401 }
    render(<ChatInterface role="manager" />)
    send()
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalledTimes(1))
  })

  it('uses market chat for the officer assistant', async () => {
    render(<ChatInterface role="officer" chatType="market" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Trợ lý Thị trường' })).toBeInTheDocument()
    send()
    await screen.findByText('Trả lời mẫu')
    const [, request] = (fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(request.body).type).toBe('market')
  })

  it('copies the finished answer', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ChatInterface role="manager" />)
    send()
    fireEvent.click(await screen.findByRole('button', { name: 'Sao chép câu trả lời' }))
    expect(writeText).toHaveBeenCalledWith('Trả lời mẫu')
    expect(await screen.findByText('Đã sao chép')).toBeInTheDocument()
  })

  it('ignores an old history response after starting a new conversation', async () => {
    let resolveHistory!: (value: object) => void
    historyResponse = new Promise(resolve => { resolveHistory = resolve })
    render(<ChatInterface role="manager" />)
    fireEvent.click(await (await openHistory()).findByRole('button', { name: 'Hội thoại đã lưu' }))
    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Trò chuyện mới' }))
    await act(async () => resolveHistory(jsonResponse({ history: [{ role: 'assistant', content: 'Lịch sử cũ' }] })))
    expect(screen.queryByText('Lịch sử cũ')).not.toBeInTheDocument()
    expect(screen.getByText('Hôm nay bạn đang nghĩ gì?')).toBeInTheDocument()
  })

  it('shows history failures instead of pretending the conversation is empty', async () => {
    historyResponse = { ok: false, status: 503 }
    render(<ChatInterface role="manager" />)
    fireEvent.click(await (await openHistory()).findByRole('button', { name: 'Hội thoại đã lưu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được cuộc trò chuyện')
    expect(screen.getByPlaceholderText('Hỏi trợ lý…')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Trò chuyện mới' }))
    expect(screen.getByPlaceholderText('Hỏi trợ lý…')).not.toBeDisabled()
  })

  it.each(['sessions', 'history'])('redirects a 401 from %s to login', async source => {
    ;(fetch as jest.Mock).mockImplementation(async (url: string) => url.includes('/sessions')
      ? source === 'sessions' ? { ok: false, status: 401 } : jsonResponse({ sessions })
      : { ok: false, status: 401 })
    render(<ChatInterface role="manager" />)
    if (source === 'history') fireEvent.click(await (await openHistory()).findByRole('button', { name: 'Hội thoại đã lưu' }))
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalledTimes(1))
  })

  it('preserves scroll position for incoming chunks when the reader scrolls up', async () => {
    let resolveRead!: (value: object) => void
    const read = jest.fn().mockResolvedValueOnce({ done: false, value: encoder.encode('{"text":"Đầu câu"}\n') })
      .mockImplementation(() => new Promise(resolve => { resolveRead = resolve }))
    postResponse = { ok: true, body: { getReader: () => ({ read, cancel: jest.fn().mockResolvedValue(undefined), releaseLock: jest.fn() }) } }
    render(<ChatInterface role="manager" />)
    const list = screen.getByRole('region', { name: 'Tin nhắn' })
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } })
    send()
    await screen.findByText('Đầu câu')
    expect(list.scrollTop).toBe(1000)
    list.scrollTop = 50
    fireEvent.scroll(list)
    await act(async () => resolveRead({ done: false, value: encoder.encode('{"text":" nối tiếp"}\n') }))
    expect(screen.getByText('Đầu câu nối tiếp')).toBeInTheDocument()
    expect(list.scrollTop).toBe(50)
    fireEvent.click(screen.getByRole('button', { name: 'Đến tin nhắn mới nhất' }))
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' })
    fireEvent.click(screen.getByRole('button', { name: 'Dừng trả lời' }))
    await act(async () => resolveRead({ done: true }))
  })

  it('aborts the active answer when unmounted', async () => {
    ;(fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { signal = init.signal as AbortSignal; return new Promise(() => undefined) }
      return jsonResponse({ sessions })
    })
    const view = render(<ChatInterface role="manager" />)
    send()
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('shows a clear unavailable message for 503', async () => {
    postResponse = { ok: false, status: 503 }
    render(<ChatInterface role="manager" />)
    send()
    expect(await screen.findByText(/Dịch vụ AI hiện không khả dụng/)).toBeInTheDocument()
  })
})

describe('chat stream boundaries', () => {
  it('decodes Vietnamese UTF-8 split at every byte and skips malformed lines', async () => {
    const bytes = encoder.encode('invalid\n' + JSON.stringify({ text: 'Chè Thái Nguyên' }) + '\r\n' + JSON.stringify({ done: true, sources: ['Nguồn Việt'] }))
    const read = jest.fn()
    bytes.forEach(byte => read.mockResolvedValueOnce({ done: false, value: new Uint8Array([byte]) }))
    read.mockResolvedValue({ done: true })
    const cancel = jest.fn().mockResolvedValue(undefined)
    const releaseLock = jest.fn()
    const update = jest.fn()
    const error = jest.fn()
    await readChatStream({ getReader: () => ({ read, cancel, releaseLock }) } as unknown as ReadableStream<Uint8Array>, new AbortController().signal, update, error)
    expect(update).toHaveBeenLastCalledWith({ content: 'Chè Thái Nguyên', sources: ['Nguồn Việt'] })
    expect(error).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
    expect(releaseLock).toHaveBeenCalled()
  })

  it.each(['<', '<t', '<th', '<thi', '<thin', '<think', '<think>Ẩn', '<THINK>Ẩn</THINK>'])('hides incomplete or complete thinking: %s', text => {
    expect(stripThinking(text)).toBe('')
  })
})
