/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { bulletinSpeechText, SPEECH_MAX_CHARS } from '@/application/telegram/chat/speech'

describe('bulletinSpeechText', () => {
  it('drops markdown marks so the voice does not read them', () => {
    expect(bulletinSpeechText('## Giá chè\n\n**Ổn định** trong tuần.\n- Tồn kho thấp')).toBe('Giá chè Ổn định trong tuần. Tồn kho thấp')
  })

  it('keeps at most 2,000 characters', () => {
    const text = bulletinSpeechText('chè '.repeat(2000))
    expect(SPEECH_MAX_CHARS).toBe(2000)
    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text.length).toBeGreaterThan(1900)
  })

  it('answers an empty string for an empty bulletin', () => {
    expect(bulletinSpeechText('  \n ')).toBe('')
  })
})
