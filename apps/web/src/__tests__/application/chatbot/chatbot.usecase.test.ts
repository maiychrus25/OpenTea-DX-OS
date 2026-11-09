/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ChatbotUseCase } from '@/application/chatbot/ChatbotUseCase'
import { CoreUnauthorizedError } from '@/domain/errors'

const create = jest.fn()
const ctor = jest.fn()
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: (...a: unknown[]) => create(...a) } }
    constructor(opts: unknown) {
      ctor(opts)
    }
  },
}))

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
