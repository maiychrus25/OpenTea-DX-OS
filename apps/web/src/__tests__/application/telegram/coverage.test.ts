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

  it('keeps Telegram link management out of the bot and the agent settings out of chat', () => {
    for (const row of listed.filter((r) => r.includes(' /api/telegram/'))) expect(TELEGRAM_COVERAGE.none).toContain(row)
    expect(TELEGRAM_COVERAGE.chatRead).toContain('GET /api/agent/proposals')
    for (const row of listed.filter((r) => r.includes(' /api/agent/') && r !== 'GET /api/agent/proposals')) {
      expect(TELEGRAM_COVERAGE.miniApp).toContain(row)
    }
  })
})
