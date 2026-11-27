// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ActionName, ToolName } from './types'
import { normalizeText } from './normalize'

export type Route = { kind: 'tool'; name: ToolName; args?: Record<string, string> } | { kind: 'action'; name: ActionName } | { kind: 'app_request' }

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
  // Issue #80 read tools (plan C1). A leading `^` anchors a phrase to the start of the sentence: `tìm` and `hộ` are
  // common words, so mid-sentence they stay with the assistant.
  ['^tim', { kind: 'tool', name: 'search' }],
  ['chung nhan', { kind: 'tool', name: 'certificate' }],
  ['dat thua', { kind: 'tool', name: 'soil' }],
  ['anh thua', { kind: 'tool', name: 'photo' }],
  ['nong ho', { kind: 'tool', name: 'households' }],
  ['^ho', { kind: 'tool', name: 'households' }],
  ['thanh vien', { kind: 'tool', name: 'members' }],
  ['bao cao benh', { kind: 'tool', name: 'diseases' }],
  ['ho so', { kind: 'tool', name: 'profile' }],
  ['tai lieu', { kind: 'tool', name: 'documents' }],
  ['doi tac', { kind: 'tool', name: 'partners' }],
]

/** The argument a tool takes from the words after its phrase (`tìm trà` is `query` = `trà`). */
const TEXT_ARG: Partial<Record<ToolName, string>> = {
  search: 'query',
  certificate: 'lot_code',
  soil: 'parcel_code',
  photo: 'parcel_code',
  households: 'name',
}

/** The words after the first run of words that fold to `phrase`, in the sentence's own spelling. */
function wordsAfter(text: string, phrase: string): string {
  const words = text.trim().split(/\s+/)
  const folded = words.map((word) => normalizeText(word).trim())
  const target = phrase.split(' ')
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((part, offset) => folded[i + offset] === part)) return words.slice(i + target.length).join(' ').replace(/[?!.,;]+$/, '')
  }
  return ''
}

/** The tool or action a sentence names, or null when it names none (the assistant takes it then). */
export function routeText(text: string): Route | null {
  const folded = normalizeText(text)
  let best: { phrase: string; route: Route } | null = null
  for (const [phrase, route] of PHRASES) {
    const anchored = phrase.startsWith('^')
    const words = anchored ? phrase.slice(1) : phrase
    if (anchored ? !folded.startsWith(` ${words} `) : !folded.includes(` ${words} `)) continue
    if (!best || words.length > best.phrase.length) best = { phrase: words, route }
  }
  if (best?.route.kind === 'tool' && TEXT_ARG[best.route.name]) {
    const value = wordsAfter(text, best.phrase)
    if (value) return { ...best.route, args: { [TEXT_ARG[best.route.name] as string]: value } }
  }
  return best?.route ?? null
}

/** `/nhatky@OpenTeaBot` is `/nhatky`; a sentence is not a command. */
export function commandOf(text: string): string | null {
  const match = /^\/([A-Za-z]+)(?:@\S+)?(?:\s|$)/.exec(text)
  return match ? `/${match[1].toLowerCase()}` : null
}
