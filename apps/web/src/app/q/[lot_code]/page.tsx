// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { XCircle } from 'lucide-react'
import { PublicTrace } from '@/components/features/qr/PublicTrace'
import styles from './qr.module.css'
import { certificateStatus } from '@/domain/certificate/status'
import { loadPublicPageData } from './public-page-data'

export const runtime = 'nodejs'

interface PageProps {
  params: Promise<{ lot_code: string }>
}

function ErrorCard({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.container}>
      <div className={styles.errorCard}>
        <div className={`${styles.iconWrapper} ${styles.iconWrapperError}`}>
          <XCircle size={32} aria-hidden="true" />
        </div>
        <h1 className={styles.errorTitle}>{title}</h1>
        <p className={styles.errorDesc}>{text}</p>
      </div>
    </div>
  )
}

/** The one public QR page (`/q/<lot code>`): every tag printed on a lot points here, including the old /lot links. */
export default async function QrTracePage({ params }: PageProps) {
  const { lot_code } = await params
  let decodedCode: string
  try {
    decodedCode = decodeURIComponent(lot_code).normalize('NFC')
  } catch {
    decodedCode = lot_code
  }
  // Boundary guard: empty, long or special characters
  if (!decodedCode || decodedCode.length > 100 || /[\/\r\n?#]/.test(decodedCode)) {
    return <ErrorCard title="Mã QR không hợp lệ" text="Mã lô chứa ký tự không hợp lệ. Vui lòng kiểm tra lại tem dán." />
  }

  const data = await loadPublicPageData(decodedCode)
  if (!data) {
    return <ErrorCard title="Không tìm thấy dữ liệu" text="Mã QR này không tồn tại trong hệ thống hoặc đã bị xóa. Vui lòng kiểm tra lại tem dán." />
  }

  return (
    <main>
      <PublicTrace
        trace={data.trace}
        verification={data.verification}
        certificateState={c => certificateStatus({ revoked_at: c.revoked_at ? new Date(c.revoked_at) : null, expires_on: c.expires_on }, data.today)}
      />
    </main>
  )
}
