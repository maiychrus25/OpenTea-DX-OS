// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui"
import styles from "../login-page.module.css"

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams?.get('error')

  const handleLogin = async () => {
    setIsLoading(true)
    await signIn("keycloak", { callbackUrl: "/" })
  }

  return (
    <div className={styles.form}>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error === 'Configuration' ? 'Không thể kết nối máy chủ xác thực.' : 'Đăng nhập thất bại. Vui lòng thử lại.'}
        </div>
      )}
      <Button 
        type="button" 
        onClick={handleLogin} 
        className={styles.submitButton} 
        isLoading={isLoading}
      >
        Tiếp tục với Keycloak
      </Button>
    </div>
  )
}
