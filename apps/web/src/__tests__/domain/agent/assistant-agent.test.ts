/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CONFIGURABLE_AGENTS } from '@/domain/agent/settings'
import { KNOWN_AGENTS } from '@/domain/agent/proposal'

describe('the Telegram assistant (A7) as a configurable agent', () => {
  it('is configurable with its own provider row, after the agents of M2 to M5 (A9 comes last, M7)', () => {
    expect(CONFIGURABLE_AGENTS).toEqual(['journal-review', 'digest', 'bulletin', 'assistant', 'improvement', 'daily-campaign'])
  })

  it('is a known agent for runs and proposals', () => {
    expect(KNOWN_AGENTS).toContain('assistant')
  })
})
