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

    const result = await new DiseaseApiAdapter('tok-1').predict(image, 'general')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://gateway:9081/api/ai/disease/predict?model=general')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-1' })
    expect(init.body).toBeInstanceOf(FormData)
    expect(timeout).toHaveBeenCalledWith(60000)
    expect(result).toEqual({ disease_name: 'Đạo ôn', confidence_score: 0.9, uncertain: false })
    timeout.mockRestore()
  })

  test('maps gateway failures to core errors without logging the token', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image, 'general')).rejects.toBeInstanceOf(CoreUnauthorizedError)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image, 'general')).rejects.toBeInstanceOf(ForbiddenError)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image, 'general')).rejects.toBeInstanceOf(CoreUnavailableError)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(new DiseaseApiAdapter('secret-tok').predict(image, 'general')).rejects.toBeInstanceOf(CoreUnavailableError)
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret-tok')
  })

  test('keeps the timeout and other-status errors as before', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    await expect(new DiseaseApiAdapter('t').predict(image, 'general')).rejects.toThrow('Disease API timeout')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 422 }))
    await expect(new DiseaseApiAdapter('t').predict(image, 'general')).rejects.toThrow('Disease API returned status 422')
  })

  test('asks for the tea model and keeps a confident tea result', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ disease_name_vi: 'Lá khoẻ', confidence: 0.988, model: 'tea', uncertain: false }), { status: 200 })
    )

    const result = await new DiseaseApiAdapter('t').predict(image, 'tea')

    expect(fetchMock.mock.calls[0][0]).toBe('http://gateway:9081/api/ai/disease/predict?model=tea')
    expect(result).toEqual({ disease_name: 'Lá khoẻ', confidence_score: 0.988, uncertain: false })
  })

  test('returns an uncertain tea result with no name', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ disease_name_vi: null, disease_name_en: null, confidence: 0.41, top3: [], model: 'tea', uncertain: true }),
        { status: 200 }
      )
    )

    await expect(new DiseaseApiAdapter('t').predict(image, 'tea')).resolves.toEqual({
      disease_name: null,
      confidence_score: 0.41,
      uncertain: true,
    })
  })

  test('a 503 for the tea model is an outage, never a silent fall back to the general model', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'tea model unavailable' }), { status: 503 }))

    await expect(new DiseaseApiAdapter('t').predict(image, 'tea')).rejects.toBeInstanceOf(CoreUnavailableError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a 400 for an unknown model is a Disease API error', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 400 }))
    await expect(new DiseaseApiAdapter('t').predict(image, 'tea')).rejects.toThrow('Disease API returned status 400')
  })
})
