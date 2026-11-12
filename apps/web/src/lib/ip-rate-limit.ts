// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { isIP } from 'net'

const MAX_IP_LENGTH = 45 // the longest textual IPv6 address

/** The first `x-forwarded-for` element when it is a short IP; anything else shares the `unknown` bucket. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''
  // The length check is needed because isIP accepts an IPv6 zone of any length, and the key lives for the whole window.
  return isIP(forwarded) && forwarded.length <= MAX_IP_LENGTH ? forwarded : 'unknown'
}

/** Returns a check that is true once `ip` made more than `max` requests in the current window. */
// shortcut: per-process and trusts the forwarded IP, move to the gateway or a shared store when web runs more than one instance
export function createIpLimiter({ max, windowMs, maxKeys = Infinity }: { max: number; windowMs: number; maxKeys?: number }) {
  const attemptsByIp = new Map<string, { count: number; resetAt: number }>()
  return (ip: string, now: number = Date.now()): boolean => {
    // The map is in expiry order, so only expired entries at its head are visited.
    let oldest = attemptsByIp.entries().next().value
    while (oldest && oldest[1].resetAt <= now) {
      attemptsByIp.delete(oldest[0])
      oldest = attemptsByIp.entries().next().value
    }
    // A full table sends new IPs to one shared bucket until keys expire, so a flood of forged IPs cannot grow memory
    // without bound, and real new clients are still let through up to `max`.
    const key = attemptsByIp.has(ip) || attemptsByIp.size < maxKeys ? ip : 'overflow'
    const attempt = attemptsByIp.get(key)
    if (!attempt || attempt.resetAt <= now) {
      attemptsByIp.delete(key)
      attemptsByIp.set(key, { count: 1, resetAt: now + windowMs })
      return false
    }
    attempt.count += 1
    return attempt.count > max
  }
}
