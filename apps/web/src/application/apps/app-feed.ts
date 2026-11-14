// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { STORE_ICONS } from '@/domain/entities/app-store'
import type { InstalledApp } from '@/domain/entities/installed-app'
import { UNSAFE_SEGMENT } from '@/lib/apps/unsafe-segment'
import { logger } from '@/lib/logger'

export interface FeedEntry {
  label: string
  path: string
  icon: string | null
  description: string
}
export interface AppFeed {
  entries: FeedEntry[]
  create: { label: string; path: string } | null
}

const MAX_ENTRIES = 30
const MAX_LABEL = 60
const MAX_DESCRIPTION = 200
const MAX_BODY_BYTES = 64 * 1024
const TIMEOUT_MS = 1500
const CACHE_MS = 15_000
// A down app must not cost every page render the full timeout, so a failure is remembered briefly too.
const FAILURE_CACHE_MS = 5000
const FEED_PATH = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/
const empty = (): AppFeed => ({ entries: [], create: null })

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** A label and path that may be shown and linked, or null: the feed is the app's output, never trusted. */
function link(raw: unknown): { label: string; path: string } | null {
  if (!isObject(raw) || typeof raw.label !== 'string' || typeof raw.path !== 'string') return null
  const label = raw.label.trim()
  if (label.length < 1 || label.length > MAX_LABEL) return null
  if (!FEED_PATH.test(raw.path) || raw.path.split('/').slice(1).some(segment => UNSAFE_SEGMENT.test(segment))) return null
  return { label, path: raw.path }
}

/** What a feed response may say: bad entries are dropped, nothing throws. */
export function parseFeed(raw: unknown): AppFeed {
  if (!isObject(raw)) return { entries: [], create: null }
  const entries = (Array.isArray(raw.entries) ? raw.entries.slice(0, MAX_ENTRIES) : []).flatMap((item): FeedEntry[] => {
    const base = link(item)
    if (!base) return []
    const { icon, description } = item as Record<string, unknown>
    return [{
      ...base,
      icon: STORE_ICONS.find(name => name === icon) ?? null,
      description: typeof description === 'string' ? description.trim().slice(0, MAX_DESCRIPTION) : '',
    }]
  })
  return { entries, create: link(raw.create) }
}

/** The body of a response as text; refuses more than `max` bytes without downloading the rest. */
async function readCapped(response: Response, max: number): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    if (text.length > max) throw new Error('feed too large')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      throw new Error('feed too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export type FeedLoader = (app: InstalledApp, role: 'farmer' | 'officer' | 'manager', htxCode: string) => Promise<AppFeed>

/** Loads an app's feed for the caller through the gateway; any failure is an empty feed, remembered for 5 s. */
export function createFeedLoader(deps: { getToken: () => Promise<string>; fetchImpl: typeof fetch; now: () => number }): FeedLoader {
  const cache = new Map<string, { at: number; ttl: number; feed: AppFeed }>()
  return async (app, role, htxCode) => {
    if (!app.feed) return empty()
    const key = JSON.stringify([app.id, htxCode, role])
    const hit = cache.get(key)
    if (hit && deps.now() - hit.at < hit.ttl) return hit.feed
    try {
      const response = await deps.fetchImpl(`${process.env.CORE_GATEWAY_URL}/apps/${app.id}${app.feed}`, {
        headers: { authorization: `Bearer ${await deps.getToken()}`, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (response.status !== 200) throw new Error(`feed answered ${response.status}`)
      const feed = parseFeed(JSON.parse(await readCapped(response, MAX_BODY_BYTES)))
      cache.set(key, { at: deps.now(), ttl: CACHE_MS, feed })
      return feed
    } catch (cause) {
      logger.error('Mini-app feed unavailable', { appId: app.id, cause })
      cache.set(key, { at: deps.now(), ttl: FAILURE_CACHE_MS, feed: empty() })
      return empty()
    }
  }
}
