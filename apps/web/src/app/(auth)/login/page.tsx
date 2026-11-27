// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import Link from "next/link"
import { Leaf } from "lucide-react"
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
          <Link href="/" className={styles.homeLink}>Trang chủ</Link>
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
            <li>Ghi nhật ký canh tác minh bạch, truy xuất được nguồn gốc</li>
            <li>AI giám sát sâu bệnh và cảnh báo kịp thời</li>
            <li>Dữ liệu của bạn được lưu trữ an toàn, bảo mật</li>
          </ul>
        </aside>

        {/* Right panel — form */}
        <main className={styles.authPanel} data-testid="auth-panel">
          <div className={styles.authCard}>
            <div className={styles.cardHeader}>
              <h1 className={styles.cardTitle}>Đăng nhập</h1>
              <p className={styles.cardDesc}>Nhập tài khoản và mật khẩu để sử dụng {BRAND_NAME}.</p>
            </div>

            <Suspense fallback={<div className={styles.form}>Đang tải...</div>}>
              <LoginForm />
            </Suspense>

            <div className={styles.help}>
              <strong>Cần hỗ trợ đăng nhập?</strong>
              <span>Gọi cán bộ: 0208 3 855 xxx (7:00 – 17:00)</span>
            </div>
          </div>
        </main>
      </div>

      <footer className={styles.footer}>
        <span>© 2026 {BRAND_NAME}</span><span>Nông nghiệp minh bạch</span><span>Điều khoản</span><span>Quyền riêng tư</span>
      </footer>
    </div>
  )
}
