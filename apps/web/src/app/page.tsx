// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import { Leaf, LogIn } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { LotCodeForm } from './_components/lot-code-form'
import styles from './home.module.css'

// Public home page. Signed-in users never see it: the middleware sends them to their dashboard.
export default function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brandIcon} aria-hidden="true">
          <Leaf size={22} />
        </span>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <h1 className={styles.title}>{BRAND_NAME}</h1>
          <p className={styles.lead}>
            Hệ điều hành số cho hợp tác xã chè: nhật ký canh tác, chẩn đoán bệnh lá chè, quản lý lứa hái và truy
            xuất nguồn gốc bằng mã QR.
          </p>
          <Link href="/login" className={styles.signIn}>
            <LogIn size={18} aria-hidden="true" />
            Đăng nhập
          </Link>
        </section>

        <section className={styles.lookup} aria-labelledby="lot-lookup-title">
          <h2 id="lot-lookup-title" className={styles.lookupTitle}>
            Tra cứu nguồn gốc lô chè
          </h2>
          <LotCodeForm />
        </section>
      </main>
    </div>
  )
}
