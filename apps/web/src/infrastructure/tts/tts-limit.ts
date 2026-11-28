// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Returns a check that is true once `userId` already made `max` requests in the last `windowMs` (sliding window). */
// shortcut: per-process limit, move to Redis or Postgres if the web scales out
export function createUserLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hitsByUser = new Map<string, number[]>()
  return (userId: string, now: number = Date.now()): boolean => {
    // People who stopped listening are dropped once the table grows, so it cannot grow without bound.
    if (hitsByUser.size > 1000) {
      hitsByUser.forEach((hits, id) => { if (hits[hits.length - 1] <= now - windowMs) hitsByUser.delete(id) })
    }
    const recent = (hitsByUser.get(userId) ?? []).filter((t) => t > now - windowMs)
    const blocked = recent.length >= max
    // A blocked request is not recorded, so it never lengthens its own block.
    if (!blocked) recent.push(now)
    hitsByUser.set(userId, recent)
    return blocked
  }
}
