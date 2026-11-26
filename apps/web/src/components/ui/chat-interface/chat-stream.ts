// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export function stripThinking(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, '')
    // A token can end in the middle of the opening tag; never flash it on screen.
    .replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, '')
    .trim()
}

interface StreamUpdate {
  content: string
  sources?: string[]
}

/** The existing API emits NDJSON, despite its text/event-stream content type. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onUpdate: (update: StreamUpdate) => void,
  onError: (message: string) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })

  const consume = (line: string): boolean => {
    if (!line.trim()) return false
    let event
    try { event = JSON.parse(line) } catch { return false }
    if (!event || typeof event !== 'object') return false
    if (event.error) {
      onError(typeof event.message === 'string' ? event.message : 'AI đang gặp sự cố, vui lòng thử lại sau.')
      return true
    }
    if (typeof event.text === 'string') text += event.text
    onUpdate({
      content: stripThinking(text),
      ...(event.done ? { sources: Array.isArray(event.sources) ? event.sources.filter((source: unknown) => typeof source === 'string') : [] } : {}),
    })
    return Boolean(event.done)
  }

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (signal.aborted) return
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (consume(line)) return
      }
      if (done) {
        consume(buffer)
        return
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
