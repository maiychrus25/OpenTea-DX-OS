/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { clientIp, createIpLimiter } from '@/lib/ip-rate-limit'

const withForwarded = (value: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': value } })

describe('createIpLimiter', () => {
  test('allows max requests per ip in a window, then limits only that ip', () => {
    const limited = createIpLimiter({ max: 2, windowMs: 1000 })
    expect([limited('a', 0), limited('a', 1), limited('a', 2)]).toEqual([false, false, true])
    expect(limited('b', 3)).toBe(false)
  })
  test('the window reopens once it has passed', () => {
    const limited = createIpLimiter({ max: 1, windowMs: 1000 })
    limited('a', 0)
    expect(limited('a', 999)).toBe(true)
    expect(limited('a', 1000)).toBe(false)
  })
  test('once maxKeys live keys are tracked, new ips share one overflow bucket limited like any key', () => {
    const limited = createIpLimiter({ max: 2, windowMs: 1000, maxKeys: 2 })
    limited('a', 0)
    limited('b', 0)
    expect([limited('c', 1), limited('d', 1), limited('e', 1)]).toEqual([false, false, true])
    // Tracked ips keep their own count.
    expect(limited('a', 1)).toBe(false)
    // Once the keys expire, a new ip gets its own bucket again.
    expect(limited('c', 1001)).toBe(false)
    expect(limited('c', 1002)).toBe(false)
    expect(limited('c', 1003)).toBe(true)
  })
  test('without maxKeys every ip keeps its own bucket', () => {
    const limited = createIpLimiter({ max: 1, windowMs: 1000 })
    for (let i = 0; i < 1000; i++) expect(limited(`ip-${i}`, 0)).toBe(false)
  })
})

describe('clientIp', () => {
  test('reads the first forwarded element, trimmed', () => {
    expect(clientIp(withForwarded(' 203.0.113.9 , 10.0.0.1'))).toBe('203.0.113.9')
  })
  test('anything that is not a short ip is unknown', () => {
    expect(clientIp(withForwarded('x'.repeat(100)))).toBe('unknown')
    expect(clientIp(withForwarded(`fe80::1%${'z'.repeat(64)}`))).toBe('unknown')
    expect(clientIp(new Request('http://localhost/'))).toBe('unknown')
  })
})
