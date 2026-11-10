// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import { CheckCircle, Leaf, Lock } from "lucide-react"
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
      {/* Left panel — desktop only */}
      <aside className={styles.authSide} data-testid="auth-side">
        <div className={styles.authSideBrand}>
          <span className={styles.brandIcon}><Leaf size={24} /></span>
          <strong>{BRAND_NAME}</strong>
        </div>
        
        <div className={styles.authSideContent}>
          <h1 className={styles.authSideTitle}>Hệ điều hành số cho hợp tác xã nông nghiệp</h1>
          <p className={styles.authSideDesc}>
            Bản tin có nguồn, bản đồ vùng trồng, nhật ký canh tác và truy xuất nguồn gốc — tất cả trên một nền tảng.
          </p>
          <ul className={styles.featureList}>
            <li><CheckCircle size={20} className={styles.checkIcon} /> Đăng nhập không mật khẩu, bảo mật bằng khóa thiết bị</li>
            <li><CheckCircle size={20} className={styles.checkIcon} /> Dữ liệu HTX được lưu trữ riêng, không chia sẻ ngoài ý muốn</li>
          </ul>
        </div>

        <div className={styles.authSideFooter}>
          Nguồn mở 100% · OLP Tin học sinh viên
        </div>
      </aside>
      
      {/* Right panel — form */}
      <main className={styles.authPanel} data-testid="auth-panel">
        <ThemeToggle className={styles.themeToggle} />
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <p className={styles.cardPretitle}>Đăng nhập</p>
            <h2 className={styles.cardTitle}>Hệ điều hành số Nông nghiệp</h2>
            <p className={styles.cardDesc}>Tiếp tục thông qua hệ thống định danh Keycloak của Hợp tác xã.</p>
          </div>
          
          <Suspense fallback={<div className={styles.form}>Đang tải...</div>}>
            <LoginForm />
          </Suspense>
          
          <div className={styles.cardFooterNote}>
            <Lock size={14} className={styles.lockIcon} />
            <span>Không dùng SMS OTP tốn phí — xác thực 100% miễn phí, chạy trên nền tảng nguồn mở Keycloak.</span>
          </div>
        </div>
      </main>
    </div>
  )
}

