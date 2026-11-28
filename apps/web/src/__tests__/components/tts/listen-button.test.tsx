// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'sonner'
import { ListenButton, RATE_LIMITED_MESSAGE } from '@/components/features/tts/ListenButton'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

let speak: jest.Mock
let voices: { lang: string }[]

beforeEach(() => {
  jest.clearAllMocks()
  voices = []
  speak = jest.fn()
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak, cancel: jest.fn(), getVoices: () => voices } })
  ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t } }
})

const respond = (status: number, type = 'application/json') => {
  global.fetch = jest.fn(async () => ({
    ok: status < 400,
    status,
    headers: { get: (h: string) => (h === 'Content-Type' ? type : null) },
    blob: async () => new Blob(['wav'], { type: 'audio/wav' }),
  })) as unknown as typeof fetch
}

test('the server sends the sentence to /api/tts', async () => {
  respond(200, 'audio/wav')
  const play = jest.fn().mockResolvedValue(undefined)
  ;(window as unknown as { Audio: unknown }).Audio = jest.fn(() => ({ play, pause: jest.fn() }))
  URL.createObjectURL = jest.fn(() => 'blob:x')
  URL.revokeObjectURL = jest.fn()
  render(<ListenButton text="Giá thu mua hôm nay: Loại 1." label="Nghe giá" />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghe giá' }))
  await waitFor(() => expect(play).toHaveBeenCalled())
  expect(global.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Giá thu mua hôm nay: Loại 1.' }) }))
})

test('a rate limit says so and does not fall back to the browser voice', async () => {
  respond(429)
  render(<ListenButton text="Xin chào." />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghe' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(RATE_LIMITED_MESSAGE))
  expect(RATE_LIMITED_MESSAGE).toBe('Bạn nghe nhiều quá, thử lại sau một phút.')
  expect(speak).not.toHaveBeenCalled()
})

test('when the server voice is unavailable the browser Vietnamese voice reads it', async () => {
  respond(503)
  voices = [{ lang: 'vi-VN' }]
  render(<ListenButton text="Xin chào." />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghe' }))
  await waitFor(() => expect(speak).toHaveBeenCalledTimes(1))
})

test('with no Vietnamese voice anywhere the button says so', async () => {
  respond(503)
  voices = [{ lang: 'en-US' }]
  render(<ListenButton text="Xin chào." />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghe' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalled())
  expect(speak).not.toHaveBeenCalled()
})

test('an empty sentence does nothing', () => {
  respond(200)
  render(<ListenButton text="   " />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghe' }))
  expect(global.fetch).not.toHaveBeenCalled()
})
