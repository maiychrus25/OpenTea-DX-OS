/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { isLabsEnabled, labsNotFound, labsOnly } from '@/lib/labs'
import { NextResponse } from 'next/server'

const previous = process.env.DXOS_LABS
afterEach(() => {
  if (previous === undefined) delete process.env.DXOS_LABS
  else process.env.DXOS_LABS = previous
})

describe('isLabsEnabled', () => {
  test.each([undefined, '', '0', 'false', 'yes'])('is false when DXOS_LABS is %p', (value) => {
    if (value === undefined) delete process.env.DXOS_LABS
    else process.env.DXOS_LABS = value
    expect(isLabsEnabled()).toBe(false)
  })

  test.each(['1', 'true'])('is true for %p', (value) => {
    process.env.DXOS_LABS = value
    expect(isLabsEnabled()).toBe(true)
  })

  test('isLabsEnabled reads the environment on every call', () => {
    delete process.env.DXOS_LABS
    expect(isLabsEnabled()).toBe(false)
    process.env.DXOS_LABS = '1'
    expect(isLabsEnabled()).toBe(true)
    process.env.DXOS_LABS = '0'
    expect(isLabsEnabled()).toBe(false)
  })
})

describe('labsOnly', () => {
  test('answers 404 NOT_FOUND without running the handler when labs is off', async () => {
    delete process.env.DXOS_LABS
    const handler = jest.fn(async () => NextResponse.json({ ok: true }))
    const response = await labsOnly(handler)()
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
    expect(handler).not.toHaveBeenCalled()
    expect((await labsNotFound().json()).error.code).toBe('NOT_FOUND')
  })

  test('runs the handler when labs is on', async () => {
    process.env.DXOS_LABS = '1'
    const handler = jest.fn(async () => NextResponse.json({ ok: true }))
    expect((await labsOnly(handler)()).status).toBe(200)
  })
})
