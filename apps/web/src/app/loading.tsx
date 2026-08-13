// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import styles from './loading.module.css'

export default function LoadingPage() {
  return (
    <div className={styles.container} aria-busy="true" aria-label="Đang tải..." data-testid="skeleton">
      <Skeleton variant="rect" height={120} width="100%" />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="80%" />
    </div>
  )
}
