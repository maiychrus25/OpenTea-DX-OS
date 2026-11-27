/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const mockFakes = { bulletin: jest.fn(), synthesize: jest.fn(), caller: jest.fn() }

jest.mock('@/lib/api/internal-telegram-auth', () => ({ requireTelegramCaller: (...args: unknown[]) => mockFakes.caller(...args) }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { bulletin: { findFirst: (...args: unknown[]) => mockFakes.bulletin(...args) } },
}))
jest.mock('@/infrastructure/tts/PiperTtsAdapter', () => ({
  PiperTtsAdapter: jest.fn(() => ({ synthesize: (...args: unknown[]) => mockFakes.synthesize(...args) })),
}))
jest.mock('@/infrastructure/db/appbuilder/PrismaAppBuildRepository', () => ({ PrismaAppBuildRepository: jest.fn() }))
jest.mock('@/auth', () => {
  throw new Error('the relay media route loaded the browser session')
})

import { GET } from '@/app/api/internal/telegram/media/route'
import { UnauthorizedError } from '@/domain/errors'

const ID = '22222222-2222-4222-8222-222222222222'
const url = (q: string) => new Request(`http://x/api/internal/telegram/media?${q}`)
const stream = (...chunks: number[][]) =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })

beforeEach(() => {
  jest.clearAllMocks()
  for (const fake of Object.values(mockFakes)) fake.mockReset()
  mockFakes.caller.mockResolvedValue({})
  mockFakes.bulletin.mockResolvedValue({ id: ID, bulletin_vi: '## Giá chè\n\n**Ổn định** trong tuần.' })
  mockFakes.synthesize.mockResolvedValue(stream([82, 73], [70, 70]))
})

describe('GET /api/internal/telegram/media?bulletin=', () => {
  it('speaks the bulletin text without markdown and answers the WAV bytes', async () => {
    const res = await GET(url(`bulletin=${ID}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([82, 73, 70, 70]))
    expect(mockFakes.synthesize).toHaveBeenCalledWith('Giá chè Ổn định trong tuần.')
  })

  it('reads only a published bulletin', async () => {
    await GET(url(`bulletin=${ID}`))
    expect(mockFakes.bulletin).toHaveBeenCalledWith({ where: { id: ID, status: 'published' } })
  })

  it('needs the relay token', async () => {
    mockFakes.caller.mockRejectedValue(new UnauthorizedError('no token'))
    expect((await GET(url(`bulletin=${ID}`))).status).toBe(401)
    expect(mockFakes.synthesize).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a uuid, and answers 404 for a bulletin that is gone', async () => {
    expect((await GET(url('bulletin=nope'))).status).toBe(400)
    mockFakes.bulletin.mockResolvedValue(null)
    expect((await GET(url(`bulletin=${ID}`))).status).toBe(404)
    expect(mockFakes.synthesize).not.toHaveBeenCalled()
  })

  it('answers 503 when Piper is not running', async () => {
    mockFakes.synthesize.mockRejectedValue(new Error('SERVICE_UNAVAILABLE'))
    expect((await GET(url(`bulletin=${ID}`))).status).toBe(503)
  })

  it('answers 503 when the stream dies half way', async () => {
    mockFakes.synthesize.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('SERVICE_UNAVAILABLE'))
        },
      })
    )
    expect((await GET(url(`bulletin=${ID}`))).status).toBe(503)
  })

  it('answers 404 for a bulletin with nothing to say', async () => {
    mockFakes.bulletin.mockResolvedValue({ id: ID, bulletin_vi: '  ' })
    expect((await GET(url(`bulletin=${ID}`))).status).toBe(404)
  })

  it('keeps the screenshot query working', async () => {
    expect((await GET(url('build=x&name=desktop-light.png'))).status).toBe(400)
  })
})
