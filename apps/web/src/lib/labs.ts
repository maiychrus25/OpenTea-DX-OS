// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'

/** Frozen features (ADR 0005) run only when DXOS_LABS is "1" or "true". Read at call time, never inlined at build time. */
export function isLabsEnabled(): boolean {
  const value = (process.env.DXOS_LABS ?? '').trim().toLowerCase()
  return value === '1' || value === 'true'
}

export function labsNotFound(): NextResponse {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Tính năng này chưa mở.' } }, { status: 404 })
}

/** Wraps a route handler of a frozen feature: answers 404 before any other work unless labs is on. */
export function labsOnly<A extends unknown[]>(handler: (...args: A) => Promise<NextResponse>) {
  return (...args: A): Promise<NextResponse> => (isLabsEnabled() ? handler(...args) : Promise.resolve(labsNotFound()))
}
