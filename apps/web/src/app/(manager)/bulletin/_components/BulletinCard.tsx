import React from 'react'
import styles from './BulletinCard.module.css'
import AudioPlayer from '@/components/features/bulletin/AudioPlayer'

type Bulletin = {
  id?: string
  commodity?: string
  bulletin_vi?: string
  sources_json?: Array<any>
  generated_at?: string
}

export default function BulletinCard({ bulletin }: { bulletin: Bulletin }) {
  const { commodity, bulletin_vi, sources_json } = bulletin

  // Render simple markdown-lite: paragraphs by double-newline
  const paragraphs = (bulletin_vi || '').split(/\n\n+/).map((p, i) => (
    <p key={i} className={styles.body}>{p}</p>
  ))

  // Extract citations (sources) to render in mono font
  const citationText = (bulletin_vi || '').match(/\(Nguồn:\s*([^\)]+)\)/i)
  const citation = citationText ? citationText[1] : (sources_json && sources_json.length ? sources_json.map((s: any) => s.source).join(', ') : '')

  return (
    <article className={styles.card}>
      <header>
        <h2 className={styles.title}>{commodity || '—'}</h2>
        <div style={{ float: 'right' }}>
          <AudioPlayer text={bulletin_vi || ''} />
        </div>
      </header>
      <div className={styles.content}>
        {paragraphs}
      </div>
      {citation ? (
        <div className={styles.citation}>
          {`(Nguồn: ${citation})`}
        </div>
      ) : null}
      <div className={styles.ttsPlaceholder}>[TTS placeholder]</div>
    </article>
  )
}
