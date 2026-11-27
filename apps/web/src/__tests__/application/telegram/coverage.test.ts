/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Test 17 of the M5 plan: every web route method sits in exactly one coverage group (spec §13.7, contract C11).
import fs from 'fs'
import path from 'path'
import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { TELEGRAM_COVERAGE } from '@/application/telegram/coverage'

const API_ROOT = path.resolve(__dirname, '../../../app/api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return dir === API_ROOT && entry.name === 'internal' ? [] : routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

/** Methods a route file exports, both as `export const GET = ...` and as `export const { GET, POST } = handlers`. */
function exportedMethods(source: string): string[] {
  const direct = Array.from(source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g), (m) => m[1])
  const destructured = Array.from(source.matchAll(/export\s+const\s+\{([^}]*)\}\s*=/g)).flatMap((m) =>
    m[1].split(',').map((name) => name.trim()).filter((name) => METHODS.includes(name))
  )
  return Array.from(new Set([...direct, ...destructured]))
}

function webRows(): string[] {
  return routeFiles(API_ROOT).flatMap((file) => {
    const apiPath = `/api/${path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/')}`.replace(/\/$/, '')
    return exportedMethods(fs.readFileSync(file, 'utf8')).map((method) => `${method} ${apiPath}`)
  })
}

const OTHER_TRACK_ROWS: string[] = [
  // Track R (read tools C1).
  'GET /api/search',
  'GET /api/lot/[lot_code]/certificate',
  'GET /api/farm/parcels/[id]/soil-health',
  'GET /api/parcels/[id]/latest-photo',
  'GET /api/farm/households',
  'GET /api/farm/households/[id]',
  'GET /api/members',
  'GET /api/officer/diseases',
  'GET /api/profile',
  'GET /api/documents',
  'GET /api/documents/url',
  'GET /api/partners',
  // Track M (disease.report).
  'POST /api/diagnosis',
  // In no contract: no tool names these two; a tool of track R or the existing `lots` and `harvest_schedule` tools must.
  'GET /api/lots/[id]',
  'GET /api/schedule/unscheduled',
]
const groups = Object.values(TELEGRAM_COVERAGE)
const listed = groups.flat()

describe('coverage table (test 17)', () => {
  it('lists every route method of the web, outside internal, exactly once', () => {
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...webRows()].sort())
  })

  it('keeps every tool route in the chat-read group and every action route in the chat-confirm group', () => {
    for (const tool of CHAT_TOOLS) for (const row of tool.routes) expect(TELEGRAM_COVERAGE.chatRead).toContain(row)
    for (const action of CHAT_ACTIONS) for (const row of action.routes) expect(TELEGRAM_COVERAGE.chatConfirm).toContain(row)
  })

  // Rows that only the read-tool and media tracks of issue #80 serve; they are not merged with the actions track yet.
  // The integrator empties this list when the three branches meet, and the test then holds for every row.
  const SERVED_BY_OTHER_TRACKS: readonly string[] = OTHER_TRACK_ROWS

  it('serves every in-chat row by a tool or an action', () => {
    const served = new Set([...CHAT_TOOLS.flatMap((tool) => tool.routes), ...CHAT_ACTIONS.flatMap((action) => action.routes)])
    const unserved = [...TELEGRAM_COVERAGE.chatRead, ...TELEGRAM_COVERAGE.chatConfirm].filter((row) => !served.has(row))
    expect(unserved.filter((row) => !SERVED_BY_OTHER_TRACKS.includes(row))).toEqual([])
    for (const row of SERVED_BY_OTHER_TRACKS) expect(CHAT_ACTIONS.flatMap((action) => action.routes)).not.toContain(row)
  })

  it('keeps Telegram link management out of the bot and the agent settings out of chat', () => {
    for (const row of listed.filter((r) => r.includes(' /api/telegram/'))) expect(TELEGRAM_COVERAGE.none).toContain(row)
    expect(TELEGRAM_COVERAGE.chatRead).toContain('GET /api/agent/proposals')
    for (const row of listed.filter((r) => r.includes(' /api/agent/') && r !== 'GET /api/agent/proposals')) {
      expect(TELEGRAM_COVERAGE.miniApp).toContain(row)
    }
  })
})
