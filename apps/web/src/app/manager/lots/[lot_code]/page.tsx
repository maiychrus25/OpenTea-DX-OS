// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { auth } from '@/auth'
import { notFound, redirect } from 'next/navigation'
import { Pill } from '@/components/ui'
import { Check } from 'lucide-react'
import { GetLotUseCase } from '@/application/lot/GetLotUseCase'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { StepTrack } from './_components/step-track'
import { QrVisual } from './_components/qr-visual'
import { CertificateManager } from '@/components/features/certificate/CertificateManager'
import styles from './lot-detail.module.css'

interface PageProps {
  params: { lot_code: string }
}

export default async function LotDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  const { lot_code: lotId } = params
  const lot = await new GetLotUseCase(new PrismaLotRepository()).execute(lotId)

  if (!lot || (lot.status !== 'READY' && lot.status !== 'QR_EXPORTED')) {
    notFound()
  }

  const weight = lot.actual_weight_kg ?? lot.estimated_weight_kg
  const statusLabel = lot.status === 'QR_EXPORTED' ? 'Đã xuất QR' : 'Sẵn sàng'
  const statusTone = lot.status === 'QR_EXPORTED' ? 'blue' : 'green'

  return (
    <div className={styles.container}>
      <Link href="/manager/lots" className={styles.backLink}>
        &larr; Quay lại danh sách lô
      </Link>

      <div className={styles.layout}>
        {/* Main Content (Left) */}
        <div className={styles.mainPanel}>
          <div className={styles.header}>
            <h1 className={styles.title}>Lô hàng {lot.lot_code}</h1>
            <Pill tone={statusTone}>{statusLabel}</Pill>
          </div>

          <StepTrack />

          <div className={styles.reviewSection}>
            <h3>5. Pre-review & hoàn thiện</h3>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Mã lô</span>
                <span className={styles.reviewValue}>{lot.lot_code} <Check size={14} className={styles.checkIcon} /></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Nông sản</span>
                <span className={styles.reviewValue}>{lot.commodity} <Check size={14} className={styles.checkIcon} /></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Ngày thu hoạch</span>
                <span className={styles.reviewValue}>{lot.harvest_date.toLocaleDateString('vi-VN')} <Check size={14} className={styles.checkIcon} /></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Ngày tạo</span>
                <span className={styles.reviewValue}>{lot.created_at.toLocaleDateString('vi-VN')} <Check size={14} className={styles.checkIcon} /></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Số thửa nguồn</span>
                <span className={styles.reviewValue}>{lot.parcel_count} thửa <Check size={14} className={styles.checkIcon} /></span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Tổng trọng lượng</span>
                <span className={styles.reviewValue}>{weight ? `${weight.toLocaleString('vi-VN')} kg` : 'Chưa ghi nhận'}</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Trạng thái công bố</span>
                <span className={styles.reviewValue}>{statusLabel}</span>
              </div>
            </div>
          </div>
          
          <div className={styles.reviewSection} style={{ marginTop: 'var(--spacing-6)' }}>
            <CertificateManager mode="select" />
          </div>

          <div className={styles.readOnlyNotice}>
            Manager chỉ có quyền xem lô hàng. Tạo, sửa, lưu nháp và xuất QR thuộc luồng Officer.
          </div>
        </div>

        {/* QR Preview Side (Right) */}
        <div className={styles.sidePanel}>
          <QrVisual />
          <span className={styles.qrCaption}>
            {lot.status === 'QR_EXPORTED' ? 'QR đã sẵn sàng trên trang truy xuất công khai' : 'QR sẽ được sinh sau khi Officer xuất'}
          </span>
          {lot.status === 'QR_EXPORTED' && (
            <Link href={`/lot/${lot.lot_code}`} className={styles.publicLink}>
              Mở trang QR
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
