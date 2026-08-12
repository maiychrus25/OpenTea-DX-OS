// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from "next"
import { signIn } from "@/auth"
import { Card, Button } from "@/components/ui"
import styles from "./login-page.module.css"

export const metadata: Metadata = {
  title: "Đăng nhập | DX-AgriMarket",
  description: "Hệ điều hành số Nông nghiệp",
}

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Đăng nhập DX-AgriMarket</h1>
          <p className={styles.subtitle}>Hệ điều hành số Nông nghiệp</p>
        </div>
        
        <form
          action={async () => {
            "use server"
            await signIn("keycloak")
          }}
          className={styles.form}
        >
          <Button type="submit" className={styles.submitButton}>
            Đăng nhập qua Keycloak
          </Button>
        </form>
      </Card>
    </div>
  )
}
