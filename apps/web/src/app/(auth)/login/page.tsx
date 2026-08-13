// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import { Card } from "@/components/ui"
import styles from "./login-page.module.css"
import { LoginForm } from "./_components/login-form"

export const metadata: Metadata = {
  title: "Đăng nhập | DX-AgriMarket",
  description: "Hệ điều hành số Nông nghiệp",
}

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>DX-AgriMarket</h1>
          <p className={styles.subtitle}>Hệ điều hành số Nông nghiệp</p>
        </div>
        
        <LoginForm />
      </Card>
    </div>
  )
}
