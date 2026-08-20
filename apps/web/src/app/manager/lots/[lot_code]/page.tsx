// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { StepTrack } from './_components/step-track'
import { QrVisual } from './_components/qr-visual'
import { LotActions } from './_components/lot-actions'
import styles from './lot-detail.module.css'

interface PageProps {
  params: { lot_code: string }
}

export default async function LotDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  const { lot_code } = params

  return (
    <div className={styles.container}>
      <Link href="/manager/lots" className={styles.backLink}>
        &larr; Quay lại danh sách lô
      </Link>

      <div className={styles.layout}>
        {/* Main Content (Left) */}
        <div className={styles.mainPanel}>
          <div className={styles.header}>
            <h1 className={styles.title}>Lô hàng {lot_code}</h1>
          </div>

          <StepTrack />

          <div className={styles.reviewSection}>
            <h3>5. Pre-review & hoàn thiện</h3>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Mã lô</span>
                <span className={styles.reviewValue}>{lot_code} <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Nông sản</span>
                <span className={styles.reviewValue}>Cải ngọt <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Ngày thu hoạch</span>
                <span className={styles.reviewValue}>12/08/2026 <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Ngày đóng gói</span>
                <span className={styles.reviewValue}>13/08/2026 <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Cách ly</span>
                <span className={styles.reviewValue}>15 ngày (đạt &gt;= 14) <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>HTX</span>
                <span className={styles.reviewValue}>HTX Rau an toàn Tân Phú <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Hộ nông dân</span>
                <span className={styles.reviewValue}>Nguyễn Văn Bình <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Thửa đất</span>
                <span className={styles.reviewValue}>TP-014, TP-016, TP-019, TP-022 <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Người duyệt</span>
                <span className={styles.reviewValue}>Trần Văn B <span className={styles.checkIcon}>✓</span></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Tổng trọng lượng</span>
                <span className={styles.reviewValue}>2.450 kg</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Quy cách đóng gói</span>
                <span className={styles.reviewValue}>Bao 25kg</span>
              </div>
            </div>
          </div>

          <LotActions lotCode={lot_code} />
        </div>

        {/* QR Preview Side (Right) */}
        <div className={styles.sidePanel}>
          <QrVisual />
          <span className={styles.qrCaption}>Mã QR sẽ được sinh sau khi xuất</span>
        </div>
      </div>
    </div>
  )
}
