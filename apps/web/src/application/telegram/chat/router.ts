// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ActionName, ToolName } from './types'
import { normalizeText } from './normalize'

export type Route = { kind: 'tool'; name: ToolName } | { kind: 'action'; name: ActionName } | { kind: 'app_request' }

/** Phrase table of contract C8. When several phrases match, the longest wins; on a tie the first row wins. */
const PHRASES: readonly [string, Route][] = [
  // A manager asks for a mini-app (M13, contract C4); for anyone else the sentence goes to the assistant.
  ['can app', { kind: 'app_request' }],
  ['lam app', { kind: 'app_request' }],
  ['xay app', { kind: 'app_request' }],
  ['can phan mem', { kind: 'app_request' }],
  ['ghi nhat ky', { kind: 'action', name: 'journal.create' }],
  ['bao benh', { kind: 'action', name: 'disease.report' }],
  ['duyet thu hoach', { kind: 'action', name: 'harvest.approve' }],
  ['duyet het', { kind: 'action', name: 'journal.batch_approve' }],
  ['duyet tat ca', { kind: 'action', name: 'journal.batch_approve' }],
  ['duyet nhat ky', { kind: 'action', name: 'journal.batch_approve' }],
  ['can duyet', { kind: 'tool', name: 'pending' }],
  ['cho duyet', { kind: 'tool', name: 'pending' }],
  ['thoi tiet', { kind: 'tool', name: 'weather' }],
  ['du bao', { kind: 'tool', name: 'weather' }],
  ['gia che', { kind: 'tool', name: 'market' }],
  ['gia thi truong', { kind: 'tool', name: 'market' }],
  ['ty gia', { kind: 'tool', name: 'market' }],
  ['ban tin', { kind: 'tool', name: 'bulletin' }],
  ['thong bao', { kind: 'tool', name: 'notifications' }],
  ['lich hai', { kind: 'tool', name: 'harvest_schedule' }],
  ['lich thu hoach', { kind: 'tool', name: 'harvest_schedule' }],
  ['thua cua toi', { kind: 'tool', name: 'parcels' }],
  ['danh sach thua', { kind: 'tool', name: 'parcels' }],
  ['vung trong', { kind: 'tool', name: 'parcels' }],
  ['lo hang', { kind: 'tool', name: 'lots' }],
  ['hom nay', { kind: 'tool', name: 'today' }],
  ['tom tat', { kind: 'tool', name: 'today' }],
  ['nhat ky', { kind: 'tool', name: 'journal' }],
]

/** The tool or action a sentence names, or null when it names none (the assistant takes it then). */
export function routeText(text: string): Route | null {
  const folded = normalizeText(text)
  let best: { phrase: string; route: Route } | null = null
  for (const [phrase, route] of PHRASES) {
    if (!folded.includes(` ${phrase} `)) continue
    if (!best || phrase.length > best.phrase.length) best = { phrase, route }
  }
  return best?.route ?? null
}

/** `/nhatky@OpenTeaBot` is `/nhatky`; a sentence is not a command. */
export function commandOf(text: string): string | null {
  const match = /^\/([A-Za-z]+)(?:@\S+)?(?:\s|$)/.exec(text)
  return match ? `/${match[1].toLowerCase()}` : null
}
