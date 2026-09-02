// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import Link from 'next/link'
import { Leaf } from 'lucide-react'
import styles from './register.module.css'
import { RegisterForm } from './_components/register-form'

export const metadata: Metadata = {
  title: 'Đăng ký tài khoản | DX-AgriMarket',
  description: 'Đăng ký tham gia hệ thống quản lý HTX nông nghiệp DX-AgriMarket',
}

import { prisma } from '@/infrastructure/db/prisma.client';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const htxList = await prisma.htxProfile.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return (
    <div className={styles.authShell} data-testid="register-shell">
      {/* Left panel — desktop only */}
      <aside className={styles.authSide} data-testid="register-side">
        <div className={styles.authSideBrand}>
          <span className={styles.brandIcon}><Leaf size={24} /></span>
          <strong>DX AgriMarket</strong>
        </div>

        <div className={styles.authSideContent}>
          <h1 className={styles.authSideTitle}>Tham gia Hợp tác xã số hóa</h1>
          <p className={styles.authSideDesc}>
            Đăng ký tài khoản nông hộ và được quản lý bởi cán bộ kỹ thuật HTX của bạn.
          </p>
          <ul className={styles.featureList}>
            <li>Nhật ký canh tác số — không cần giấy tờ</li>
            <li>Bản đồ thửa đất, vụ mùa trực quan</li>
            <li>Nhận thông báo kỹ thuật từ cán bộ</li>
          </ul>
        </div>

        <div className={styles.authSideFooter}>
          Tài khoản sẽ được phê duyệt bởi Trưởng HTX
        </div>
      </aside>

      {/* Right panel — form */}
      <main className={styles.authPanel} data-testid="register-panel">
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <Link href="/login" className="inline-flex items-center text-sm text-[var(--primary)] hover:underline mb-2 font-medium">
              ← Quay lại
            </Link>
            <p className={styles.cardPretitle}>Đăng ký</p>
            <h2 className={styles.cardTitle}>Tạo tài khoản nông hộ</h2>
            <p className={styles.cardDesc}>
              Điền thông tin bên dưới. Tài khoản sẽ chờ phê duyệt từ Trưởng HTX.
            </p>
          </div>

          <RegisterForm htxList={htxList} />
        </div>
      </main>
    </div>
  )
}
