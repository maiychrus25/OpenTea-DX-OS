// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from "next/link"
import { auth } from "@/auth"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import styles from "./Unauthorized.module.css"

export default async function UnauthorizedPage() {
  const session = await auth()
  const role = session?.user?.role
  
  let redirectUrl = "/"
  if (role === "manager") redirectUrl = "/manager"
  else if (role === "officer") redirectUrl = "/officer"
  else if (role === "farmer") redirectUrl = "/farmer"

  return (
    <div className={styles.container}>
      <Card padding="default">
        <div className={styles.content}>
          <h1 className={styles.title}>403 -- Không có quyền truy cập</h1>
          <p className={styles.description}>Bạn không có quyền truy cập vào trang này dựa trên chức vụ của bạn.</p>
          <Link href={redirectUrl}>
            <Button variant="primary">
              Về trang phù hợp
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
