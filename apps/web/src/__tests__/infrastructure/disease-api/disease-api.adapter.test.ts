/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DiseaseApiAdapter } from '@/infrastructure/disease-api/disease-api.adapter'
import { CoreUnauthorizedError, CoreUnavailableError, ForbiddenError } from '@/domain/errors'
import { logger } from '@/lib/logger'

const ok = () => new Response(JSON.stringify({ disease_name_vi: 'Đạo ôn', confidence: 0.9, extra: 'x' }), { status: 200 })
const image = new Blob(['x'], { type: 'image/jpeg' })

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://gateway:9081'
})

let logError: jest.SpyInstance
let fetchMock: jest.SpyInstance
beforeEach(() => {
  logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
  fetchMock = jest.spyOn(global, 'fetch')
})
afterEach(() => {
  logError.mockRestore()
  fetchMock.mockRestore()
})

describe('DiseaseApiAdapter', () => {
  test('predict posts to CORE_GATEWAY_URL/api/ai/disease/predict with the bearer token and a 60 s timeout', async () => {
    fetchMock.mockResolvedValue(ok())
    const timeout = jest.spyOn(AbortSignal, 'timeout')

    const result = await new DiseaseApiAdapter('tok-1').predict(image)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://gateway:9081/api/ai/disease/predict')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-1' })
    expect(init.body).toBeInstanceOf(FormData)
    expect(timeout).toHaveBeenCalledWith(60000)
    expect(result).toEqual({ disease_name: 'Đạo ôn', confidence_score: 0.9 })
    timeout.mockRestore()
  })

  test('maps gateway failures to core errors without logging the token', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image)).rejects.toBeInstanceOf(CoreUnauthorizedError)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image)).rejects.toBeInstanceOf(ForbiddenError)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image)).rejects.toBeInstanceOf(CoreUnavailableError)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image)).rejects.toBeInstanceOf(CoreUnavailableError)
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret-tok')
  })

  test('keeps the timeout and other-status errors as before', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    await expect(new DiseaseApiAdapter('t').predict(image)).rejects.toThrow('Disease API timeout')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 422 }))
    await expect(new DiseaseApiAdapter('t').predict(image)).rejects.toThrow('Disease API returned status 422')
  })
})
