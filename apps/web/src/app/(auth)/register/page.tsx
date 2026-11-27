// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import Link from 'next/link'
import { Check, ChevronLeft, Leaf } from 'lucide-react'
import shell from '../login/login-page.module.css'
import styles from './register.module.css'
import { RegisterForm } from './_components/register-form'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export const metadata: Metadata = {
  title: 'Đăng ký tài khoản',
  description: `Đăng ký tham gia hệ thống quản lý HTX chè ${BRAND_NAME}`,
}

import { prisma } from '@/infrastructure/db/prisma.client';
import { BRAND_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const htxList = await prisma.htxProfile.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return (
    <div className={shell.authShell} data-testid="register-shell">
      <header className={shell.topbar}>
        <Link href="/" className={shell.brand}>
          <span className={shell.brandIcon} aria-hidden="true"><Leaf size={22} /></span>
          <strong>{BRAND_NAME}</strong>
        </Link>
        <nav className={shell.topActions} aria-label="Điều hướng">
          <Link href="/" className={shell.homeLink}>
            <ChevronLeft size={16} aria-hidden="true" /> Trang chủ
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <div className={shell.authBox}>
        {/* Left panel — desktop only */}
        <aside className={shell.authSide} data-testid="register-side">
          <h2 className={shell.authSideTitle}>
            Hệ điều hành số
            <span>cho hợp tác xã chè.</span>
          </h2>
          <ul className={shell.featureList}>
            <li><Check size={16} className={shell.checkIcon} aria-hidden="true" /> Ghi nhật ký canh tác minh bạch, truy xuất được nguồn gốc</li>
            <li><Check size={16} className={shell.checkIcon} aria-hidden="true" /> AI nhận diện sâu bệnh từ ảnh lá chè</li>
            <li><Check size={16} className={shell.checkIcon} aria-hidden="true" /> Dữ liệu HTX được lưu trữ riêng</li>
          </ul>
        </aside>

        {/* Right panel — form */}
        <main className={`${shell.authPanel} ${styles.panel}`} data-testid="register-panel">
          <div className={shell.authCard}>
            <div className={shell.cardHeader}>
              <h1 className={shell.cardTitle}>Đăng ký</h1>
              <p className={shell.cardDesc}>Tạo tài khoản nông hộ. Trưởng HTX duyệt rồi mới đăng nhập được.</p>
            </div>

            <RegisterForm htxList={htxList} />
          </div>
        </main>
      </div>

      <footer className={shell.footer}>© 2026 {BRAND_NAME} · Nông nghiệp minh bạch</footer>
    </div>
  )
}
