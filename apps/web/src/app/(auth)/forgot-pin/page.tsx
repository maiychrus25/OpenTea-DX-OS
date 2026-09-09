// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import { Leaf } from 'lucide-react'
import styles from './forgot-pin.module.css'
import { ForgotPinForm } from './_components/forgot-pin-form'

export const metadata: Metadata = {
  title: 'Quên mã PIN | DX-AgriMarket',
  description: 'Khôi phục mã PIN đăng nhập hệ thống HTX nông nghiệp',
}

export default function ForgotPinPage() {
  return (
    <div className={styles.authShell} data-testid="forgot-pin-shell">
      {/* Left panel — desktop only */}
      <aside className={styles.authSide} data-testid="forgot-pin-side">
        <div className={styles.authSideBrand}>
          <span className={styles.brandIcon}><Leaf size={24} /></span>
          <strong>DX AgriMarket</strong>
        </div>

        <div className={styles.authSideContent}>
          <h1 className={styles.authSideTitle}>Khôi phục mã PIN</h1>
          <p className={styles.authSideDesc}>
            Xác minh danh tính qua số điện thoại đã đăng ký, sau đó tạo mã PIN mới an toàn.
          </p>
        </div>

        <div className={styles.authSideFooter}>
          Bảo mật 100% — không lưu PIN trên server
        </div>
      </aside>

      {/* Right panel — form */}
      <main className={styles.authPanel} data-testid="forgot-pin-panel">
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <p className={styles.cardPretitle}>Khôi phục tài khoản</p>
            <h2 className={styles.cardTitle}>Quên mã PIN</h2>
          </div>

          <ForgotPinForm />
        </div>
      </main>
    </div>
  )
}
