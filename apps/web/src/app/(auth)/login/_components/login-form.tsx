// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
 import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui'
import styles from '../login-page.module.css'
import { getAuthErrorMessage, isAccountLocked } from '@/lib/auth-validation'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const searchParams = useSearchParams()
  const errorCode = searchParams?.get('error') ?? null

  const errorMessage = getAuthErrorMessage(errorCode)
  const isLocked = isAccountLocked(errorCode)

  const handleLogin = async () => {
    setIsLoading(true)
    await signIn('keycloak', { callbackUrl: '/' })
  }

  return (
    <div className={styles.form}>
      {/* AC-3: All login error states in Vietnamese */}
      {errorMessage && (
        <div
          className={`${styles.errorBanner} ${isLocked ? styles.errorBannerLocked : ''}`}
          role="alert"
          data-testid={`error-${errorCode}`}
        >
          <span>{errorMessage}</span>
          {isLocked && (
            <Link
              href="/forgot-pin"
              className={styles.recoveryLink}
              data-testid="locked-recovery-link"
            >
              Khôi phục PIN →
            </Link>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={handleLogin}
        className={styles.submitButton}
        isLoading={isLoading}
        data-testid="keycloak-login-btn"
      >
        Tiếp tục với Keycloak
      </Button>

      <div className={styles.authLinks}>
        <Link href="/forgot-pin" className={styles.authLink} data-testid="forgot-pin-link">
          Quên PIN?
        </Link>
        <Link href="/register" className={styles.authLink} data-testid="register-link">
          Đăng ký tài khoản
        </Link>
      </div>
    </div>
  )
}
