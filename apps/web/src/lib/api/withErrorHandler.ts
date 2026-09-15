// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { DomainError, NotFoundError, ValidationError, ForbiddenError } from '@/domain/errors'
import { logger } from '@/lib/logger'

type RouteHandler<TContext = any> = (req: Request, context: TContext) => Promise<NextResponse>

function isNextInternalError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as Record<string, unknown>).digest === 'string'
  )
}

export function withErrorHandler<TContext = any>(handler: RouteHandler<TContext>): RouteHandler<TContext> {
  return async (req: Request, context: TContext) => {
    try {
      return await handler(req, context)
    } catch (err: unknown) {
      if (isNextInternalError(err)) {
        throw err
      }

      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Validation Error' } },
          { status: 400 }
        )
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return NextResponse.json(
            { error: { code: 'CONFLICT', message: 'Dữ liệu này đã tồn tại (bị trùng lặp)' } },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { error: { code: 'DATABASE_ERROR', message: 'Database Error' } },
          { status: 400 }
        )
      }
      if (err instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: err.message } },
          { status: 404 }
        )
      }
      if (err instanceof ValidationError) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: err.message } },
          { status: 400 }
        )
      }
      if (err instanceof DomainError) {
        return NextResponse.json(
          { error: { code: 'DOMAIN_ERROR', message: err.message } },
          { status: 422 }
        )
      }
      if (err instanceof ForbiddenError) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: err.message } },
          { status: 403 }
        )
      }
      logger.error('Unhandled API Error', { error: err, url: req.url })
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } },
        { status: 500 }
      )
    }
  }
}
