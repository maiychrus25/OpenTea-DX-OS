// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useCallback } from 'react'
import { CheckCircle2, Volume2, Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
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
    setTtsState('idle')
  }, [])

  const handleListen = useCallback(async () => {
    if (ttsState === 'playing') {
      stop()
      return
    }
    if (ttsState === 'loading') {
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
          setTtsState('idle') 
        }
        audio.onerror = () => { 
          if (currentUrlRef.current === url) {
            URL.revokeObjectURL(url)
            currentUrlRef.current = null
          }
          setTtsState('idle') 
        }
        setTtsState('playing')
        await audio.play()
        return
      }
    } catch {
      // Piper not available
    }

    // Fallback: Web Speech API (check for authentic Vietnamese voice)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('vi'))

      if (viVoice) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.voice = viVoice
        utterance.lang = viVoice.lang
        utterance.rate = 0.9
        utterance.onend = () => setTtsState('idle')
        utterance.onerror = () => setTtsState('idle')
        setTtsState('playing')
        window.speechSynthesis.speak(utterance)
      } else {
        toast.error('Dịch vụ đọc văn bản (Piper TTS) đang tạm gián đoạn và thiết bị chưa có gói giọng đọc Tiếng Việt.')
        setTtsState('idle')
      }
    } else {
      toast.error('Trình duyệt không hỗ trợ đọc văn bản.')
      setTtsState('idle')
    }
  }, [ttsState, headline, summary, stop])

  return (
    <article className={styles.newsArticle}>
      <div className={styles.articleHeader}>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      
      <h2 className={styles.articleTitle}>{headline}</h2>
      <div className={styles.articleSummary}>
        <ReactMarkdown>{summary}</ReactMarkdown>
      </div>
      
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
