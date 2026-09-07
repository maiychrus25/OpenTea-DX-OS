// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Volume2, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import styles from './bulletin.module.css'

interface ListenButtonProps {
  bulletinTexts: string[]
}

export function ListenBulletinButton({ bulletinTexts }: ListenButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setState('idle')
  }, [])

  const play = useCallback(async () => {
    if (state === 'playing') {
      stop()
      return
    }

    const fullText = bulletinTexts.join('. ')
    if (!fullText.trim()) return

    setState('loading')

    // Try Piper TTS first (server-side, open source)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText }),
      })

      if (res.ok && res.headers.get('Content-Type')?.includes('audio')) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(url)
          setState('idle')
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          setState('idle')
        }

        setState('playing')
        await audio.play()
        return
      }
    } catch {
      // Piper TTS not available — fallback to Web Speech API
    }

    // Fallback: Web Speech API (browser built-in, no server needed)
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(fullText)
      utterance.lang = 'vi-VN'
      utterance.rate = 0.9
      utterance.pitch = 1
      synthRef.current = utterance

      utterance.onend = () => setState('idle')
      utterance.onerror = () => setState('idle')

      setState('playing')
      window.speechSynthesis.speak(utterance)
    } else {
      setState('idle')
    }
  }, [state, bulletinTexts, stop])

  return (
    <Button
      variant="secondary"
      className={styles.audioButton}
      onClick={play}
      aria-label={state === 'playing' ? 'Dừng phát' : 'Nghe bản tin sáng'}
    >
      {state === 'loading' && <Loader2 size={18} className={styles.spinner} />}
      {state === 'playing' && <Square size={16} />}
      {state === 'idle' && <Volume2 size={18} />}
      {state === 'playing' ? 'Dừng phát' : state === 'loading' ? 'Đang tải...' : 'Nghe bản tin sáng'}
    </Button>
  )
}
