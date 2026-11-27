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

/** Only the Mini App entry may ask to come back to a page after sign-in; anything else goes to the role home. */
export function safeCallbackUrl(value: string | null | undefined): string {
  return value && /^\/telegram\/open(\?[A-Za-z0-9/_\-?=&%.]*)?$/.test(value) ? value : '/'
}

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [username, setUsername] = useState('')
  const searchParams = useSearchParams()
  const errorCode = searchParams?.get('error') ?? null

  const errorMessage = getAuthErrorMessage(errorCode)
  const isLocked = isAccountLocked(errorCode)

  const handleLogin = async () => {
    setIsLoading(true)
    // The name only pre-fills Keycloak's form; the password is typed there and never reaches this app.
    const name = username.trim()
    await signIn('keycloak', { callbackUrl: safeCallbackUrl(searchParams?.get('callbackUrl')) }, name ? { login_hint: name } : undefined)
  }

  return (
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void handleLogin() }}>
      {/* AC-3: All login error states in Vietnamese */}
      {errorMessage && (
        <div
          className={`${styles.errorBanner} ${isLocked ? styles.errorBannerLocked : ''}`}
          role="alert"
          data-testid={`error-${errorCode}`}
        >
          <span>{errorMessage}</span>
          {isLocked && (
            <span data-testid="locked-recovery-note">Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại.</span>
          )}
        </div>
      )}

      <label className={styles.field}>
        Tên đăng nhập
        <input type="text" name="username" autoComplete="username" placeholder="Nhập tên đăng nhập" value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>

      <div className={styles.forgotRow}>
        <span>Mật khẩu nhập ở bước tiếp theo.</span>
        <span data-testid="forgot-pin-note">Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại.</span>
      </div>

      <Button
        type="button"
        onClick={handleLogin}
        className={styles.submitButton}
        isLoading={isLoading}
        data-testid="keycloak-login-btn"
      >
        Đăng nhập
      </Button>

      <p className={styles.register}>
        Bạn chưa có tài khoản?{' '}
        <Link href="/register" className={styles.authLink} data-testid="register-link">
          Đăng ký ngay
        </Link>
      </p>
    </form>
  )
}
