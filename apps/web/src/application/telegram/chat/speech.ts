// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import removeMd from 'remove-markdown'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'
import { latestBulletin } from './tools/bulletin'

/** The most text the voice reads: a longer bulletin is read up to here (rules-and-limits §2.3). */
export const SPEECH_MAX_CHARS = 2000

/** What the voice reads for a bulletin: plain text on one line, cut at 2,000 characters. */
export function bulletinSpeechText(bulletinVi: string): string {
  return removeMd(bulletinVi).replace(/\s+/g, ' ').trim().slice(0, SPEECH_MAX_CHARS).trim()
}

/** The engine's two questions before it sends audio, so it needs neither Piper nor Prisma itself. */
export interface BulletinSpeech {
  /** The voice service answers right now. */
  ready(): Promise<boolean>
  /** The newest bulletin of the cooperative that the bulletin tool shows. */
  latest(htxCode: string): Promise<{ id: string; createdAt: Date } | null>
}

export function piperBulletinSpeech(): BulletinSpeech {
  return {
    ready: () => new PiperTtsAdapter().checkHealth(),
    latest: async (htxCode) => {
      const bulletin = await latestBulletin(htxCode)
      return bulletin ? { id: bulletin.id, createdAt: bulletin.created_at } : null
    },
  }
}
