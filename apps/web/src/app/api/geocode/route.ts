// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { geocodeQuerySchema } from '@/lib/validations/geocode.schema'
import { NominatimGeocodingAdapter } from '@/infrastructure/geocoding/NominatimAdapter'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ValidationError } from '@/domain/errors'

// In-memory rate limiting map: IP -> Last Request Timestamp
// Note: This is an MVP implementation. For production across multiple instances, use Redis.
const rateLimitMap = new Map<string, number>()
const RATE_LIMIT_MS = 1000 // 1 req/s per Nominatim ToS

async function getGeocodeHandler(request: Request) {
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  // Rate Limiting (1 req/s per IP)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'
  const now = Date.now()
  const lastRequestTime = rateLimitMap.get(ip)

  if (lastRequestTime && now - lastRequestTime < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Nominatim limits to 1 req/s.' } },
      { status: 429 }
    )
  }
  rateLimitMap.set(ip, now)

  // Validation
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  const parseResult = geocodeQuerySchema.safeParse({ q })
  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters: ' + parseResult.error.message)
  }

  // Execution
  const adapter = new NominatimGeocodingAdapter()
  const results = await adapter.search(parseResult.data.q)

  return NextResponse.json({ results })
}

export const GET = withErrorHandler(getGeocodeHandler)
