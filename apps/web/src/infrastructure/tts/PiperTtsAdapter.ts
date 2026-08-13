// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { TtsPort } from '@/domain/shared/ports/TtsPort'

export class PiperTtsAdapter implements TtsPort {
  private readonly piperUrl: string

  constructor() {
    this.piperUrl = 'http://piper:10200/api/tts'
  }

  async synthesize(text: string): Promise<ReadableStream> {
    try {
      const response = await fetch(this.piperUrl, {
        method: 'POST',
        body: text,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(30000), // 30s timeout
      })

      if (!response.ok) {
        throw new Error('Piper service returned an error.')
      }

      if (!response.body) {
        throw new Error('Piper service returned empty body.')
      }

      return response.body as ReadableStream
    } catch (error) {
      throw new Error('SERVICE_UNAVAILABLE')
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Just check if the host is reachable. 
      // We send a GET request with a short timeout.
      await fetch('http://piper:10200/', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      })
      // If we get a response, the socket is open
      return true
    } catch (error) {
      return false
    }
  }
}
