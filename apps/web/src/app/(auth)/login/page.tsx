// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import Link from "next/link"
import { Check, ChevronLeft, Leaf } from "lucide-react"
import styles from "./login-page.module.css"
import { Suspense } from "react"
import { LoginForm } from "./_components/login-form"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { BRAND_NAME } from "@/lib/brand"

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Hệ điều hành số Nông nghiệp",
}

export default function LoginPage() {
  return (
    <div className={styles.authShell} data-testid="auth-shell">
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true"><Leaf size={22} /></span>
          <strong>{BRAND_NAME}</strong>
        </Link>
        <nav className={styles.topActions} aria-label="Điều hướng">
          <Link href="/" className={styles.homeLink}>
            <ChevronLeft size={16} aria-hidden="true" /> Trang chủ
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <div className={styles.authBox}>
        {/* Left panel — desktop only */}
        <aside className={styles.authSide} data-testid="auth-side">
          <h2 className={styles.authSideTitle}>
            Hệ điều hành số
            <span>cho hợp tác xã chè.</span>
          </h2>
          <ul className={styles.featureList}>
            <li><Check size={16} className={styles.checkIcon} aria-hidden="true" /> Ghi nhật ký canh tác minh bạch, truy xuất được nguồn gốc</li>
            <li><Check size={16} className={styles.checkIcon} aria-hidden="true" /> AI nhận diện sâu bệnh từ ảnh lá chè</li>
            <li><Check size={16} className={styles.checkIcon} aria-hidden="true" /> Dữ liệu HTX được lưu trữ riêng</li>
          </ul>
        </aside>

        {/* Right panel — form */}
        <main className={styles.authPanel} data-testid="auth-panel">
          <div className={styles.authCard}>
            <div className={styles.cardHeader}>
              <h1 className={styles.cardTitle}>Đăng nhập</h1>
              <p className={styles.cardDesc}>Dùng tài khoản hợp tác xã để vào {BRAND_NAME}.</p>
            </div>

            <Suspense fallback={<div className={styles.form}>Đang tải...</div>}>
              <LoginForm />
            </Suspense>

            <div className={styles.help}>
              <strong>Cần hỗ trợ đăng nhập?</strong>
              <span>Liên hệ cán bộ hợp tác xã của bạn.</span>
            </div>
          </div>
        </main>
      </div>

      <footer className={styles.footer}>© 2026 {BRAND_NAME} · Nông nghiệp minh bạch</footer>
    </div>
  )
}
