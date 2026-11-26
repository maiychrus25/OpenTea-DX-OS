/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CONFIGURABLE_AGENTS } from '@/domain/agent/settings'
import { KNOWN_AGENTS } from '@/domain/agent/proposal'

describe('A10 in settings (contract C9)', () => {
  it('improvement is a configurable agent and a known agent', () => {
    expect(CONFIGURABLE_AGENTS).toContain('improvement')
    expect(KNOWN_AGENTS).toContain('improvement')
  })
})
