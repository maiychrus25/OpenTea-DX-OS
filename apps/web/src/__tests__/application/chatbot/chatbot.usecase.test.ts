/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ChatbotUseCase } from '@/application/chatbot/ChatbotUseCase'
import { CoreUnauthorizedError } from '@/domain/errors'
import { SIMULATED_MARKET_SOURCE } from '@/domain/market/simulated-price'
import OpenAI from 'openai'

const create = jest.fn()
const ctor = jest.fn()
jest.mock('openai', () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`)
    }
  }
  return {
  __esModule: true,
  default: class {
    static APIError = APIError
    chat = { completions: { create: (...a: unknown[]) => create(...a) } }
    constructor(opts: unknown) {
      ctor(opts)
    }
  },
  }
})

const env = { ...process.env }
beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...env, CORE_GATEWAY_URL: 'http://gateway:9081' }
  delete process.env.OLLAMA_MODEL
  delete process.env.GROQ_API_KEY
  create.mockResolvedValue((async function* () {})())
})
afterAll(() => {
  process.env = env
})

const run = (useCase: ChatbotUseCase) => useCase.execute('hi', [], undefined, undefined, 'market')

describe('ChatbotUseCase client selection', () => {
  test('without a Groq key uses CORE_GATEWAY_URL/api/ai/llm/v1 with the user token as API key and model qwen2.5:0.5b by default', async () => {
    await run(new ChatbotUseCase(undefined, undefined, undefined, async () => 'tok-1'))

    expect(ctor).toHaveBeenCalledWith({ apiKey: 'tok-1', baseURL: 'http://gateway:9081/api/ai/llm/v1' })
    expect(create.mock.calls[0][0].model).toBe('qwen2.5:0.5b')
  })

  test('OLLAMA_MODEL still overrides the gateway model', async () => {
    process.env.OLLAMA_MODEL = 'other:1b'
    await run(new ChatbotUseCase(undefined, undefined, undefined, async () => 'tok-1'))
    expect(create.mock.calls[0][0].model).toBe('other:1b')
  })

  test('without a Groq key and without a token fails closed with the token error', async () => {
    const getToken = async () => {
      throw new CoreUnauthorizedError()
    }
    await expect(run(new ChatbotUseCase(undefined, undefined, undefined, getToken))).rejects.toBeInstanceOf(CoreUnauthorizedError)
    expect(create).not.toHaveBeenCalled()
  })

  test('with a Groq key still uses Groq and never asks for a token', async () => {
    process.env.GROQ_API_KEY = 'gsk_real'
    const getToken = jest.fn()

    await run(new ChatbotUseCase(undefined, undefined, undefined, getToken))

    expect(getToken).not.toHaveBeenCalled()
    expect(ctor).toHaveBeenCalledWith({ apiKey: 'gsk_real', baseURL: 'https://api.groq.com/openai/v1' })
    expect(create.mock.calls[0][0].model).toBe('llama-3.1-8b-instant')
  })
})

describe('ChatbotUseCase gateway failures', () => {
  const readAll = async (stream: ReadableStream) => {
    const reader = stream.getReader()
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return out
      out += new TextDecoder().decode(value)
    }
  }
  const gateway = () => new ChatbotUseCase(undefined, undefined, undefined, async () => 'tok-1')
  const failWith = (status: number) => create.mockRejectedValue(new (OpenAI as any).APIError(status))

  test('a 401 from the gateway becomes CoreUnauthorizedError', async () => {
    failWith(401)
    await expect(run(gateway())).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })

  test('a 429 from the gateway streams a busy message', async () => {
    failWith(429)
    const out = await readAll(await run(gateway()))
    expect(out).toContain('bận')
    expect(out).not.toContain('không khả dụng')
  })

  test('a 503 from the gateway keeps the unavailable message', async () => {
    failWith(503)
    expect(await readAll(await run(gateway()))).toContain('không khả dụng')
  })

  test('the Groq path keeps the unavailable message even on 401', async () => {
    process.env.GROQ_API_KEY = 'gsk_real'
    failWith(401)
    expect(await readAll(await run(new ChatbotUseCase()))).toContain('không khả dụng')
  })
})

describe('ChatbotUseCase technical documents', () => {
  const storage = () => ({ listDocuments: jest.fn().mockResolvedValue([]), getDocumentContent: jest.fn() })

  test('reads only the Resources and Areas of the HTX', async () => {
    const documents = storage()
    const useCase = new ChatbotUseCase(documents as never, undefined, undefined, async () => 'tok-1', 'TC')
    await useCase.execute('hi', [], undefined, undefined, 'technical')
    expect(documents.listDocuments.mock.calls.map(c => c[0])).toEqual(['para/TC/Resources/', 'para/TC/Areas/'])
  })

  test('reads no document without an HTX', async () => {
    const documents = storage()
    const useCase = new ChatbotUseCase(documents as never, undefined, undefined, async () => 'tok-1')
    await useCase.execute('hi', [], undefined, undefined, 'technical')
    expect(documents.listDocuments).not.toHaveBeenCalled()
  })
})

describe('ChatbotUseCase market context', () => {
  const row = (source: string) => ({
    id: source, source, commodity: 'Tea', metric: 'Giá chè búp khô', value: 200000, unit: 'VND/kg', period: '2026-11-10', fetched_at: new Date(),
  })
  const market = {
    getRecentMarketData: jest.fn().mockResolvedValue([row(SIMULATED_MARKET_SOURCE), row('COMTRADE')]),
    getLatestFxRate: jest.fn().mockResolvedValue(null),
  }

  test('marks simulated prices as giá mô phỏng and tells the model to say so', async () => {
    await run(new ChatbotUseCase(undefined, undefined, market, async () => 'tok-1'))
    const system: string = create.mock.calls[0][0].messages[0].content
    const lines = system.split('\n')

    expect(lines.find(l => l.startsWith(`- [${SIMULATED_MARKET_SOURCE}]`))).toContain('giá mô phỏng')
    expect(lines.find(l => l.startsWith('- [COMTRADE]'))).not.toContain('giá mô phỏng')
    expect(system).toMatch(/ghi rõ "giá mô phỏng"/)
  })
})
