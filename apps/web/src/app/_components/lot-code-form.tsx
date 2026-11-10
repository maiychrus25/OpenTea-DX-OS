// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import styles from '../home.module.css'

export function LotCodeForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const id = useId()
  const inputId = `${id}-code`
  const noteId = `${id}-note`

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Vui lòng nhập mã lô hàng.')
      return
    }
    setError('')
    router.push(`/q/${encodeURIComponent(trimmed)}`)
  }

  return (
    <form className={styles.lotForm} onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className={styles.lotLabel}>
        Mã lô hàng
      </label>
      <div className={styles.lotRow}>
        <input
          id={inputId}
          name="lot_code"
          className={styles.lotInput}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TC-CHE-A3-001"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={noteId}
        />
        <button type="submit" className={styles.lotButton}>
          <Search size={18} aria-hidden="true" />
          Tra cứu
        </button>
      </div>
      {error ? (
        <p id={noteId} className={styles.lotError} role="alert">
          {error}
        </p>
      ) : (
        <p id={noteId} className={styles.lotHint}>
          Mã in trên bao bì hoặc dưới mã QR của lô chè.
        </p>
      )}
    </form>
  )
}
