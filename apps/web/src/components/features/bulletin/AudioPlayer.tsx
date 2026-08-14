"use client"

import React, { useEffect, useRef, useState } from 'react'
import styles from './AudioPlayer.module.css'

type Props = {
  text: string
}

type State = 'idle' | 'loading' | 'playing'

// Use a global to coordinate playback across multiple instances
declare global {
  interface Window {
    __TTS_CURRENT?: { audio: HTMLAudioElement; id: number }
  }
}

let instanceCounter = 0

export default function AudioPlayer({ text }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [state, setState] = useState<State>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const idRef = useRef<number>(++instanceCounter)

  useEffect(() => {
    // Check Piper availability
    let mounted = true
    fetch('/api/tts/status').then(r => r.json()).then(j => {
      if (!mounted) return
      setAvailable(Boolean(j?.available))
    }).catch(() => setAvailable(false))
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    // cleanup on unmount
    const id = idRef.current
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (window.__TTS_CURRENT?.id === id) {
        window.__TTS_CURRENT = undefined
      }
    }
  }, [])

  async function handlePlay() {
    if (!available) return
    if (!text || text.trim().length === 0) return

    // Stop other playing audio
    if (window.__TTS_CURRENT && window.__TTS_CURRENT.audio) {
      try { window.__TTS_CURRENT.audio.pause() } catch {};
      window.__TTS_CURRENT = undefined
    }

    setState('loading')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: 'vi' }),
      })

      if (!res.ok) {
        setState('idle')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      window.__TTS_CURRENT = { audio, id: idRef.current }

      audio.onended = () => {
        setState('idle')
        try { URL.revokeObjectURL(url) } catch {}
        if (window.__TTS_CURRENT?.id === idRef.current) window.__TTS_CURRENT = undefined
      }

      audio.onerror = () => {
        setState('idle')
        try { URL.revokeObjectURL(url) } catch {}
        if (window.__TTS_CURRENT?.id === idRef.current) window.__TTS_CURRENT = undefined
      }

      // Start playing
      await audio.play()
      setState('playing')
    } catch (e) {
      setState('idle')
    }
  }

  function handleStop() {
    const audio = audioRef.current || window.__TTS_CURRENT?.audio
    if (audio) {
      try { audio.pause() } catch {}
      if (audio.src) {
        try { URL.revokeObjectURL(audio.src) } catch {}
      }
    }
    audioRef.current = null
    if (window.__TTS_CURRENT?.id === idRef.current) window.__TTS_CURRENT = undefined
    setState('idle')
  }

  if (available === false) {
    return <div className={styles.hidden} />
  }

  return (
    <div className={styles.playerRoot}>
      {state === 'idle' && (
        <button aria-label="Nghe tóm tắt" className={styles.ttsButton} onClick={handlePlay}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M5 3v18l13-9L5 3z" />
          </svg>
        </button>
      )}

      {state === 'loading' && (
        <div role="status" aria-label="Đang tải" className={styles.spinner} />
      )}

      {state === 'playing' && (
        <button aria-label="Dừng phát" className={styles.ttsButton} onClick={handleStop}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 6h4v12H6zM14 6h4v12h-4z" />
          </svg>
        </button>
      )}
    </div>
  )
}
