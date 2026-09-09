// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Volume2, Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import styles from './bulletin.module.css'

interface ListenButtonProps {
  bulletinTexts: string[]
}

export function ListenBulletinButton({ bulletinTexts }: ListenButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setState('idle')
  }, [])

  const play = useCallback(async () => {
    if (state === 'playing') {
      stop()
      return
    }
    if (state === 'loading') {
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
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current)
        }
        const url = URL.createObjectURL(blob)
        currentUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          if (currentUrlRef.current === url) {
            URL.revokeObjectURL(url)
            currentUrlRef.current = null
          }
          setState('idle')
        }
        audio.onerror = () => {
          if (currentUrlRef.current === url) {
            URL.revokeObjectURL(url)
            currentUrlRef.current = null
          }
          setState('idle')
        }

        setState('playing')
        await audio.play()
        return
      }
    } catch {
      // Piper TTS not available — fallback to Web Speech API
    }

    // Fallback: Web Speech API (check for authentic Vietnamese voice)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('vi'))

      if (viVoice) {
        const utterance = new SpeechSynthesisUtterance(fullText)
        utterance.voice = viVoice
        utterance.lang = viVoice.lang
        utterance.rate = 0.9
        utterance.pitch = 1
        synthRef.current = utterance

        utterance.onend = () => setState('idle')
        utterance.onerror = () => setState('idle')

        setState('playing')
        window.speechSynthesis.speak(utterance)
      } else {
        toast.error('Dịch vụ đọc văn bản (Piper TTS) đang tạm gián đoạn và thiết bị chưa có gói giọng đọc Tiếng Việt.')
        setState('idle')
      }
    } else {
      toast.error('Trình duyệt không hỗ trợ đọc văn bản.')
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
