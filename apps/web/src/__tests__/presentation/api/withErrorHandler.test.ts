import { NextResponse } from 'next/server'
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { NotFoundError, ValidationError, DomainError } from '@/domain/errors'

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: ResponseInit) => {
      return {
        status: init?.status ?? 200,
        json: async () => body,
      } as unknown as NextResponse
    }),
  },
}))

function createMockRequest(): Request {
  return { url: 'http://localhost' } as Request
}

describe('withErrorHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('maps NotFoundError to 404 with NOT_FOUND code', async () => {
    const handler = withErrorHandler(async () => {
      throw new NotFoundError('Item not found')
    })

    const response = await handler(createMockRequest(), {})
    expect((response as { status: number }).status).toBe(404)

    const data = await (response as { json: () => Promise<unknown> }).json()
    const err = data as { error: { code: string; message: string } }
    expect(err.error.code).toBe('NOT_FOUND')
    expect(err.error.message).toBe('Item not found')
  })

  it('maps ValidationError to 400 with VALIDATION_ERROR code', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('Invalid input')
    })

    const response = await handler(createMockRequest(), {})
    expect((response as { status: number }).status).toBe(400)

    const data = await (response as { json: () => Promise<unknown> }).json()
    const err = data as { error: { code: string; message: string } }
    expect(err.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps generic DomainError to 422 with DOMAIN_ERROR code', async () => {
    const handler = withErrorHandler(async () => {
      throw new DomainError('Some domain issue')
    })

    const response = await handler(createMockRequest(), {})
    expect((response as { status: number }).status).toBe(422)

    const data = await (response as { json: () => Promise<unknown> }).json()
    const err = data as { error: { code: string; message: string } }
    expect(err.error.code).toBe('DOMAIN_ERROR')
  })

  it('maps generic Error to 500 with INTERNAL_ERROR code', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withErrorHandler(async () => {
      throw new Error('Kaboom')
    })

    const response = await handler(createMockRequest(), {})
    expect((response as { status: number }).status).toBe(500)

    const data = await (response as { json: () => Promise<unknown> }).json()
    const err = data as { error: { code: string; message: string } }
    expect(err.error.code).toBe('INTERNAL_ERROR')
  })

  it('passes through successful responses unchanged', async () => {
    const successResponse = {
      status: 200,
      json: async () => ({ data: 'ok' }),
    } as unknown as NextResponse

    const handler = withErrorHandler(async () => successResponse)
    const response = await handler(createMockRequest(), {})
    expect(response).toBe(successResponse)
  })

  it('forwards context parameter to the wrapped handler', async () => {
    const ctx = { params: { id: '42' } }
    let receivedContext: unknown

    const handler = withErrorHandler(async (_req: Request, context: unknown) => {
      receivedContext = context
      return NextResponse.json({ ok: true })
    })

    await handler(createMockRequest(), ctx)
    expect(receivedContext).toBe(ctx)
  })
})
