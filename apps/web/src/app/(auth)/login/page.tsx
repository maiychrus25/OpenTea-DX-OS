// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import Link from "next/link"
import { Check, ChevronLeft, Leaf, Lock, ShieldCheck } from "lucide-react"
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
            <li><Check size={16} className={styles.checkIcon} aria-hidden="true" /> Đăng nhập không mật khẩu bằng khóa thiết bị</li>
            <li><Check size={16} className={styles.checkIcon} aria-hidden="true" /> Dữ liệu HTX được lưu trữ riêng</li>
          </ul>
        </aside>

        {/* Right panel — form */}
        <main className={styles.authPanel} data-testid="auth-panel">
          <div className={styles.authCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon} aria-hidden="true"><ShieldCheck size={26} /></span>
              <h1 className={styles.cardTitle}>Đăng nhập</h1>
              <p className={styles.cardDesc}>Sử dụng tài khoản hợp tác xã để truy cập {BRAND_NAME}.</p>
            </div>

            <Suspense fallback={<div className={styles.form}>Đang tải...</div>}>
              <LoginForm />
            </Suspense>

            <div className={styles.cardFooterNote}>
              <Lock size={14} className={styles.lockIcon} aria-hidden="true" />
              <span>Nút đăng nhập sẽ đưa anh/chị đến hệ thống xác thực Keycloak của hợp tác xã.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
