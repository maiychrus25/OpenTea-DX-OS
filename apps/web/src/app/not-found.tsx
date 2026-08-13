// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import styles from './not-found.module.css'

export default function NotFoundPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Không tìm thấy trang</h1>
        <p className={styles.message}>
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ bỏ.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.link}>
            <Button variant="primary">Về trang chủ</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
