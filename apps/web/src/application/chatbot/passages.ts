// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Passage selection for the technical chatbot: BM25 over diacritic-folded tokens, no vector store (phase 4 spec §3.4).

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150
const K1 = 1.2
const B = 0.75
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const AI_OPT_OUT = /^\s*ai\s*:\s*false\s*$/im

export interface PassageDoc {
  key: string
  name: string
  text: string
  /** False for a file the cooperative keeps away from the AI (front-matter `ai: false`). */
  ai: boolean
}

export interface Passage {
  name: string
  text: string
  score: number
}

/** Lowercase and without Vietnamese marks, so a question typed without diacritics still matches. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}

const tokens = (text: string) => foldText(text).split(/[^a-z0-9]+/).filter((t) => t.length > 1)

/** True when the file's front matter says `ai: false`. */
export function hasAiOptOut(text: string): boolean {
  const match = FRONT_MATTER.exec(text)
  return match !== null && AI_OPT_OUT.test(match[1])
}

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(start, start + CHUNK_SIZE))
    if (start + CHUNK_SIZE >= text.length) break
  }
  return chunks
}

/** The best `k` passages for the question, each with its file name; files with `ai: false` never come back. */
export function selectPassages(question: string, docs: PassageDoc[], k = 4): Passage[] {
  const queryTokens = Array.from(new Set(tokens(question)))
  if (queryTokens.length === 0) return []

  const chunks = docs
    .filter((d) => d.ai)
    .flatMap((d) => chunkText(d.text.replace(FRONT_MATTER, '')).map((text) => ({ name: d.name, text, terms: tokens(text) })))
  if (chunks.length === 0) return []

  const avgLength = chunks.reduce((sum, c) => sum + c.terms.length, 0) / chunks.length || 1
  const frequencies = chunks.map((c) => {
    const f = new Map<string, number>()
    for (const t of c.terms) f.set(t, (f.get(t) ?? 0) + 1)
    return f
  })
  const idf = new Map(queryTokens.map((q) => {
    const n = frequencies.filter((f) => f.has(q)).length
    return [q, Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5))] as const
  }))

  return chunks
    .map((c, i) => {
      const score = queryTokens.reduce((sum, q) => {
        const tf = frequencies[i].get(q) ?? 0
        return tf === 0 ? sum : sum + (idf.get(q) as number) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * c.terms.length) / avgLength)))
      }, 0)
      return { name: c.name, text: c.text, score }
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
