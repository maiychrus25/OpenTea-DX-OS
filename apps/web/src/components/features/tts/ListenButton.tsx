// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Volume2, Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'

export const RATE_LIMITED_MESSAGE = 'Bạn nghe nhiều quá, thử lại sau một phút.'
const NO_VOICE_MESSAGE = 'Thiết bị chưa có giọng đọc tiếng Việt, và máy chủ đọc đang tạm nghỉ.'

interface Props {
  /** The sentence to read. It is built from what is on screen; never pass bank details. */
  text: string
  /** The idle label, e.g. "Nghe". */
  label?: string
}

/**
 * Reads a short Vietnamese text: the server voice first, then the browser voice when the server is unavailable.
 * A rate-limited request says so and does not fall back, so the limit is not dodged.
 */
export function ListenButton({ text, label = 'Nghe' }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setState('idle')
  }, [])

  function speakInBrowser(): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().replace('_', '-').startsWith('vi'))
    if (!voice) return false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang
    utterance.rate = 0.9
    utterance.onend = () => setState('idle')
    utterance.onerror = () => setState('idle')
    setState('playing')
    window.speechSynthesis.speak(utterance)
    return true
  }

  const play = useCallback(async () => {
    if (state === 'playing') { stop(); return }
    if (state === 'loading' || !text.trim()) return
    setState('loading')
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      if (res.status === 429) {
        toast.error(RATE_LIMITED_MESSAGE)
        setState('idle')
        return
      }
      if (res.ok && res.headers.get('Content-Type')?.includes('audio')) {
        const url = URL.createObjectURL(await res.blob())
        urlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        const finish = () => { setState('idle'); if (urlRef.current === url) { URL.revokeObjectURL(url); urlRef.current = null } }
        audio.onended = finish
        audio.onerror = finish
        setState('playing')
        await audio.play()
        return
      }
    } catch {
      // The server voice is unavailable; the browser voice below takes over.
    }
    if (!speakInBrowser()) {
      toast.error(NO_VOICE_MESSAGE)
      setState('idle')
    }
    // speakInBrowser sets 'playing' itself; nothing more to do here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, text, stop])

  return (
    <Button variant="secondary" onClick={play} aria-label={state === 'playing' ? 'Dừng đọc' : `${label}`}>
      {state === 'loading' && <Loader2 size={18} aria-hidden="true" />}
      {state === 'playing' && <Square size={16} aria-hidden="true" />}
      {state === 'idle' && <Volume2 size={18} aria-hidden="true" />}
      {state === 'playing' ? 'Dừng đọc' : state === 'loading' ? 'Đang tải...' : label}
    </Button>
  )
}
