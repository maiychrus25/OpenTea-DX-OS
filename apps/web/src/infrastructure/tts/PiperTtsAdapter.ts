// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { TtsPort } from '@/domain/shared/ports/TtsPort'
import net from 'net'

export class PiperTtsAdapter implements TtsPort {
  private readonly piperHost = 'piper'
  private readonly piperPort = 10200

  async synthesize(text: string): Promise<ReadableStream> {
    return new ReadableStream({
      start: (controller) => {
        const client = new net.Socket()

        // Implement 30s timeout
        client.setTimeout(30000)

        let state: 'JSON' | 'PAYLOAD' = 'JSON'
        let payloadLength = 0
        let buffer = Buffer.alloc(0)

        client.on('timeout', () => {
          client.destroy()
          controller.error(new Error('SERVICE_UNAVAILABLE'))
        })

        client.on('error', () => {
          controller.error(new Error('SERVICE_UNAVAILABLE'))
        })

        client.connect(this.piperPort, this.piperHost, () => {
          // Send Wyoming protocol synthesize request
          const request = {
            type: 'synthesize',
            data: { text }
          }
          client.write(JSON.stringify(request) + '\n')
        })

        client.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk])

          let processing = true
          while (processing && buffer.length > 0) {
            if (state === 'JSON') {
              const nlIdx = buffer.indexOf('\n')
              if (nlIdx === -1) {
                // Not a full JSON line yet
                processing = false
                break
              }

              const jsonStr = buffer.subarray(0, nlIdx).toString('utf-8')
              buffer = buffer.subarray(nlIdx + 1)

              if (!jsonStr.trim()) continue

              try {
                const event = JSON.parse(jsonStr)
                if (event.type === 'audio-chunk') {
                  payloadLength = event.payload_length || 0
                  if (payloadLength > 0) {
                    state = 'PAYLOAD'
                  }
                } else if (event.type === 'audio-stop') {
                  controller.close()
                  client.end()
                  processing = false
                }
              } catch (err) {
                // Ignore parsing errors for unexpected lines
              }
            } else if (state === 'PAYLOAD') {
              if (buffer.length < payloadLength) {
                // Wait for the full payload
                processing = false
                break
              }

              const payload = buffer.subarray(0, payloadLength)
              buffer = buffer.subarray(payloadLength)

              // Enqueue audio payload chunk to the ReadableStream
              controller.enqueue(new Uint8Array(payload))
              state = 'JSON'
            }
          }
        })
      }
    })
  }

  async checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket()
      let isResolved = false

      client.setTimeout(2000)

      const finalize = (status: boolean) => {
        if (!isResolved) {
          isResolved = true
          client.destroy()
          resolve(status)
        }
      }

      client.on('connect', () => finalize(true))
      client.on('error', () => finalize(false))
      client.on('timeout', () => finalize(false))

      client.connect(this.piperPort, this.piperHost)
    })
  }
}
