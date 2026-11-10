// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client' // Error components must be Client Components

import React, { useEffect } from 'react'
import styles from './Dashboard.module.css'
import ErrorPage from '@/app/error'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  if (error.digest === 'NO_HTX') {
    return <ErrorPage error={error} reset={reset} />
  }

  return (
    <main className={styles.container}>
      <section className={styles.ctaCard}>
        <h2 className={styles.ctaTitle}>Đã có lỗi xảy ra!</h2>
        <p className={styles.ctaDesc}>Không thể tải thông tin Dashboard. Vui lòng thử lại sau.</p>
        <button 
          className={styles.ctaButton} 
          onClick={() => reset()}
        >
          Thử lại
        </button>
      </section>
    </main>
  )
}
