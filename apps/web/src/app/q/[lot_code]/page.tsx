// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Pill } from '@/components/ui'
import { XCircle, AlertTriangle, Clock } from 'lucide-react'
import styles from './qr.module.css'

interface PageProps {
  params: { lot_code: string }
  searchParams: { status?: string }
}

export default function QrTracePage({ params, searchParams }: PageProps) {
  const status = searchParams.status || 'valid' // valid, invalid, expired, revoked

  if (status === 'invalid' || status === 'not-found') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={styles.iconWrapper} style={{ backgroundColor: '#ffebee', color: '#d32f2f' }}>
            <XCircle size={32} />
          </div>
          <h1 className={styles.errorTitle}>Không tìm thấy dữ liệu</h1>
          <p className={styles.errorDesc}>
            Mã QR này không tồn tại trong hệ thống hoặc đã bị xóa. Vui lòng kiểm tra lại tem dán.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'revoked') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={styles.iconWrapper} style={{ backgroundColor: '#fff3e0', color: '#f57c00' }}>
            <AlertTriangle size={32} />
          </div>
          <h1 className={styles.errorTitle}>Lô hàng đã bị thu hồi</h1>
          <p className={styles.errorDesc}>
            Mã QR này thuộc về lô hàng <strong>{params.lot_code}</strong> nhưng đã bị thu hồi bởi Cán bộ Kỹ thuật do không đạt tiêu chuẩn an toàn. Không sử dụng sản phẩm này.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={styles.iconWrapper} style={{ backgroundColor: '#eceff1', color: '#546e7a' }}>
            <Clock size={32} />
          </div>
          <h1 className={styles.errorTitle}>Lô hàng đã hết hạn</h1>
          <p className={styles.errorDesc}>
            Thời hạn sử dụng của lô hàng <strong>{params.lot_code}</strong> đã kết thúc. Vui lòng xem kỹ hạn sử dụng trên bao bì thực tế.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.mockHeader}>
        <h1>DX-AgriMarket</h1>
        <p>Truy xuất Nguồn gốc Nông sản</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.lotName}>Cải ngọt VietGAP</h2>
          <Pill tone="green">Đạt chuẩn An Toàn</Pill>
        </div>
        <div className={styles.detailList}>
          <div className={styles.detailItem}>
            <span className={styles.label}>Mã lô:</span>
            <span className={styles.value}>{params.lot_code}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.label}>Nông hộ:</span>
            <span className={styles.value}>Nguyễn Văn Bình</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.label}>Hợp tác xã:</span>
            <span className={styles.value}>HTX Rau an toàn Tân Phú</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.label}>Ngày thu hoạch:</span>
            <span className={styles.value}>12/08/2026</span>
          </div>
        </div>

        <div className={styles.certBox}>
          <strong>Chứng nhận:</strong>
          <p>Lô hàng này đã trải qua 15 ngày cách ly thuốc BVTV, vượt chuẩn an toàn (14 ngày).</p>
        </div>
      </div>

      <div className={styles.testNav}>
        <h4>(Mock Test Controls)</h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a href={`/q/${params.lot_code}?status=invalid`} className={styles.testLink}>Test Invalid</a>
          <a href={`/q/${params.lot_code}?status=revoked`} className={styles.testLink}>Test Revoked</a>
          <a href={`/q/${params.lot_code}?status=expired`} className={styles.testLink}>Test Expired</a>
          <a href={`/q/${params.lot_code}?status=valid`} className={styles.testLink}>Test Valid</a>
        </div>
      </div>
    </div>
  )
}
