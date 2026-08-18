// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const DISEASE_API_URL = process.env.DISEASE_API_URL || 'http://disease-api:8000'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB — rules-and-limits.md §2.1
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])

export async function POST(req: Request) {
  // ── Auth check (server-side) — rules-and-limits.md §4 ───────────────
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    )
  }

  try {
    // ── Parse multipart form data ─────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Image file is required' } },
        { status: 400 },
      )
    }

    // ── Validate content type ─────────────────────────────────────────
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Only JPEG and PNG images are accepted.',
          },
        },
        { status: 400 },
      )
    }

    // ── Validate file size (max 5MB) ──────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 5MB.`,
          },
        },
        { status: 400 },
      )
    }

    // ── Forward to disease-api (internal Docker network) ──────────────
    // AD-8: Browser NEVER calls disease-api directly — always through this proxy
    const proxyFormData = new FormData()
    proxyFormData.append('file', file)

    const response = await fetch(`${DISEASE_API_URL}/predict`, {
      method: 'POST',
      body: proxyFormData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: 'Unknown error' }))
      const statusCode = response.status === 503 ? 503 : response.status === 400 ? 400 : 500
      return NextResponse.json(
        {
          error: {
            code: statusCode === 503 ? 'AI_UNAVAILABLE' : 'VALIDATION_ERROR',
            message: errorBody.detail?.error || errorBody.detail || 'Disease API error',
          },
        },
        { status: statusCode },
      )
    }

    const prediction = await response.json()

    // ── Return prediction result ──────────────────────────────────────
    // AI Invariant: response contains ONLY disease name + confidence
    // NO treatment, NO recommendation
    return NextResponse.json({
      data: {
        disease_name: prediction.disease_name_vi,
        confidence_score: prediction.confidence,
        disease_name_en: prediction.disease_name_en,
        top3: prediction.top3,
      },
    })
  } catch (error: unknown) {
    // Network errors: disease-api unreachable, timeout, DNS failure
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.message.includes('ECONNREFUSED'))
    ) {
      return NextResponse.json(
        { error: { code: 'AI_UNAVAILABLE', message: 'Disease API service is not reachable' } },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
