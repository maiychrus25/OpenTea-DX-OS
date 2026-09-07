// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { CheckCircle2, Volume2, Square, Loader2 } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import styles from './bulletin.module.css'

export type BulletinCategory = 'market' | 'weather' | 'technical'

export interface BulletinCardProps {
  category: BulletinCategory
  headline: string
  summary: string
  date: string
  sourceCount: number
}

const CATEGORY_MAP: Record<BulletinCategory, { label: string, tone: 'green' | 'amber' | 'blue' | 'neutral' }> = {
  market: { label: 'Thị trường', tone: 'green' },
  weather: { label: 'Thời tiết', tone: 'blue' },
  technical: { label: 'Kỹ thuật', tone: 'amber' },
}

export function BulletinCard({ category, headline, summary, date, sourceCount }: BulletinCardProps) {
  const meta = CATEGORY_MAP[category]
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setTtsState('idle')
  }, [])

  const handleListen = useCallback(async () => {
    if (ttsState === 'playing') {
      stop()
      return
    }

    const text = `${headline}. ${summary}`
    setTtsState('loading')

    // Try Piper TTS first
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (res.ok && res.headers.get('Content-Type')?.includes('audio')) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { URL.revokeObjectURL(url); setTtsState('idle') }
        audio.onerror = () => { URL.revokeObjectURL(url); setTtsState('idle') }
        setTtsState('playing')
        await audio.play()
        return
      }
    } catch {
      // Piper not available
    }

    // Fallback: Web Speech API
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'vi-VN'
      utterance.rate = 0.9
      utterance.onend = () => setTtsState('idle')
      utterance.onerror = () => setTtsState('idle')
      setTtsState('playing')
      window.speechSynthesis.speak(utterance)
    } else {
      setTtsState('idle')
    }
  }, [ttsState, headline, summary, stop])

  return (
    <article className={styles.newsArticle}>
      <div className={styles.articleHeader}>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      
      <h2 className={styles.articleTitle}>{headline}</h2>
      <p className={styles.articleSummary}>{summary}</p>
      
      <div className={styles.sourceRow}>
        <CheckCircle2 size={16} />
        <span>{sourceCount} nguồn đã kiểm chứng</span>
      </div>
      
      <div className={styles.articleMeta}>
        <span>{date}</span>
        <button
          className={`${styles.audioBtn} ${ttsState === 'playing' ? styles.audioBtnActive : ''}`}
          aria-label={ttsState === 'playing' ? 'Dừng phát' : 'Nghe bản tin'}
          type="button"
          onClick={handleListen}
        >
          {ttsState === 'loading' && <Loader2 size={16} className={styles.spinner} />}
          {ttsState === 'playing' && <Square size={14} />}
          {ttsState === 'idle' && <Volume2 size={18} />}
        </button>
      </div>
    </article>
  )
}
