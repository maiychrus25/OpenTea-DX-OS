// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { TtsPort } from '@/domain/shared/ports/TtsPort'
import net from 'net'

export class PiperTtsAdapter implements TtsPort {
  private readonly piperHost: string
  private readonly piperPort: number

  constructor(host?: string, port?: number) {
    this.piperHost = host || process.env.PIPER_HOST || (process.env.NODE_ENV === 'production' ? 'piper' : '127.0.0.1')
    this.piperPort = port || Number(process.env.PIPER_PORT) || (process.env.NODE_ENV === 'production' ? 10200 : 5500)
  }

  private createWavHeader(dataLength: number, sampleRate = 22050, numChannels = 1, bitsPerSample = 16): Buffer {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // Subchunk1Size (16 for standard PCM)
    header.writeUInt16LE(1, 20)  // AudioFormat (1 for PCM)
    header.writeUInt16LE(numChannels, 22)
    header.writeUInt32LE(sampleRate, 24)
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    header.writeUInt32LE(byteRate, 28)
    const blockAlign = (numChannels * bitsPerSample) / 8
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40)
    return header
  }

  async synthesize(text: string): Promise<ReadableStream> {
    let socketRef: net.Socket | null = null

    return new ReadableStream({
      start: (controller) => {
        const client = new net.Socket()
        socketRef = client

        // 30s timeout per rules-and-limits.md §2.3
        client.setTimeout(30000)

        let state: 'HEADER' | 'DATA' | 'PAYLOAD' = 'HEADER'
        let currentEvent: { type?: string; data_length?: number; payload_length?: number } = {}
        let dataLength = 0
        let payloadLength = 0
        let buffer = Buffer.alloc(0)
        const pcmChunks: Buffer[] = []
        let sampleRate = 22050

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

          // Prevent excessive buffer growth (max 10MB)
          if (buffer.length > 10 * 1024 * 1024) {
            client.destroy()
            controller.error(new Error('SERVICE_UNAVAILABLE'))
            return
          }

          let processing = true
          while (processing && buffer.length > 0) {
            if (state === 'HEADER') {
              const nlIdx = buffer.indexOf('\n')
              if (nlIdx === -1) {
                processing = false
                break
              }

              const line = buffer.subarray(0, nlIdx).toString('utf-8')
              buffer = buffer.subarray(nlIdx + 1)

              if (!line.trim()) continue

              try {
                currentEvent = JSON.parse(line)
                dataLength = currentEvent.data_length || 0
                payloadLength = currentEvent.payload_length || 0
                state = dataLength > 0 ? 'DATA' : (payloadLength > 0 ? 'PAYLOAD' : 'HEADER')

                if (currentEvent.type === 'audio-stop') {
                  processing = false
                  client.end()
                  break
                }
              } catch {
                // If header is malformed, skip
                state = 'HEADER'
              }
            } else if (state === 'DATA') {
              if (buffer.length < dataLength) {
                processing = false
                break
              }

              const dataBytes = buffer.subarray(0, dataLength)
              buffer = buffer.subarray(dataLength)

              try {
                const dataObj = JSON.parse(dataBytes.toString('utf-8'))
                if (dataObj.rate) sampleRate = dataObj.rate
              } catch {
                // Ignore data payload parse errors
              }

              state = payloadLength > 0 ? 'PAYLOAD' : 'HEADER'
            } else if (state === 'PAYLOAD') {
              if (buffer.length < payloadLength) {
                processing = false
                break
              }

              const payload = buffer.subarray(0, payloadLength)
              buffer = buffer.subarray(payloadLength)
              pcmChunks.push(payload)
              state = 'HEADER'
            }
          }
        })

        client.on('end', () => {
          const totalPcm = Buffer.concat(pcmChunks)
          const wavHeader = this.createWavHeader(totalPcm.length, sampleRate)
          controller.enqueue(new Uint8Array(wavHeader))
          if (totalPcm.length > 0) {
            controller.enqueue(new Uint8Array(totalPcm))
          }
          controller.close()
        })
      },
      cancel: () => {
        socketRef?.destroy()
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
