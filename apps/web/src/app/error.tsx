// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import styles from './error.module.css'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Đã xảy ra lỗi hệ thống</h1>
        <p className={styles.message}>
          Rất xin lỗi vì sự bất tiện này. Vui lòng thử lại.
        </p>
        <div className={styles.actions}>
          <Button variant="danger" onClick={reset}>Thử lại</Button>
        </div>
      </div>
    </div>
  )
}
