// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useState } from 'react'
import { Bot, Check, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ChatMessage as Message } from './use-chat'
import styles from './chat-interface.module.css'

export function ChatMessage({ message, streaming }: { message: Message; streaming: boolean }) {
  const [copyStatus, setCopyStatus] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopyStatus('Đã sao chép')
    } catch { setCopyStatus('Không thể sao chép. Hãy chọn và sao chép văn bản.') }
  }

  if (message.role === 'user') return (
    <div className={`${styles.messageRow} ${styles.messageRowUser}`}>
      <div className={styles.userMessage}>{message.content}</div>
    </div>
  )

  return (
    <div className={`${styles.messageRow} ${styles.messageRowBot}`}>
      <div className={styles.avatar} aria-hidden="true"><Bot size={18} /></div>
      <div className={styles.botMessage}>
        {message.content ? (
          <div className={`${styles.markdownContent} ${message.isError ? styles.errorMessage : ''}`} role={message.isError ? 'alert' : undefined}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
              h1: ({ children }) => <h2>{children}</h2>,
              table: ({ children }) => <div className={styles.tableScroll} role="region" aria-label="Bảng dữ liệu" tabIndex={0}><table>{children}</table></div>,
              pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
            }}>{message.content}</ReactMarkdown>
          </div>
        ) : streaming && <div className={styles.typing} role="status"><span aria-hidden="true">•••</span> Đang suy nghĩ...</div>}
        {streaming && message.content && <span className={styles.cursor} aria-label="Đang trả lời">▍</span>}
        {!!message.sources?.length && (
          <ul className={styles.sourceList} aria-label="Nguồn tham khảo">
            {message.sources.map((source, index) => <li key={`${source}-${index}`} className={styles.sourceItem}>{source}</li>)}
          </ul>
        )}
        {message.content && !streaming && (
          <div className={styles.messageActions}>
            <button className={styles.copyButton} onClick={copy} aria-label="Sao chép câu trả lời" title="Sao chép câu trả lời">
              {copyStatus === 'Đã sao chép' ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <span role="status">{copyStatus}</span>
          </div>
        )}
      </div>
    </div>
  )
}
