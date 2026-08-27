// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import styles from '../register.module.css'
import {
  validateFullName,
  validatePhone,
  validatePin,
  validatePinMatch,
} from '@/lib/auth-validation'

// Mock HTX list — FE prototype only, no real API call
const MOCK_HTX_LIST = [
  { id: 'HTX-001', name: 'HTX Nông nghiệp Đồng Tháp' },
  { id: 'HTX-002', name: 'HTX Lúa Gạo Sóc Trăng' },
  { id: 'HTX-003', name: 'HTX Trái Cây Tiền Giang' },
  { id: 'HTX-004', name: 'HTX Rau Sạch Lâm Đồng' },
]

interface FormErrors {
  fullName?: string
  phone?: string
  htxId?: string
  pin?: string
  confirmPin?: string
  consent?: string
}

type FormState = 'idle' | 'loading' | 'pending-approval'

export function RegisterForm() {
  const [state, setState] = useState<FormState>('idle')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [htxId, setHtxId] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): boolean {
    const newErrors: FormErrors = {}

    const nameErr = validateFullName(fullName)
    if (nameErr) newErrors.fullName = nameErr

    const phoneErr = validatePhone(phone)
    if (phoneErr) newErrors.phone = phoneErr

    if (!htxId) newErrors.htxId = 'Vui lòng chọn Hợp tác xã'

    const pinErr = validatePin(pin)
    if (pinErr) newErrors.pin = pinErr

    const confirmErr = validatePinMatch(pin, confirmPin)
    if (confirmErr) newErrors.confirmPin = confirmErr

    if (!consent) newErrors.consent = 'Vui lòng đồng ý với điều khoản'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validate()) return

    // AC-5: Mock-only — không tạo session, không gọi BE
    setState('loading')
    // Giả lập network delay
    await new Promise((r) => setTimeout(r, 1000))
    setState('pending-approval')
  }

  // ── Pending Approval State (AC-1) ───────────────────────────────────────────
  if (state === 'pending-approval') {
    return (
      <div className={styles.pendingState} data-testid="pending-approval-state">
        <div className={styles.pendingIcon} aria-hidden="true">⏳</div>
        <h3 className={styles.pendingTitle}>Đang chờ phê duyệt</h3>
        <p className={styles.pendingDesc}>
          Yêu cầu đăng ký của <strong>{fullName}</strong> đã được ghi nhận.
          Trưởng HTX sẽ phê duyệt tài khoản của bạn trong vòng 1–2 ngày làm việc.
        </p>
        <p className={styles.pendingDesc} style={{ fontSize: '0.8125rem', opacity: 0.7 }}>
          Sau khi được phê duyệt, bạn sẽ nhận được thông báo qua số điện thoại đã đăng ký.
        </p>
        <Link href="/login" className={styles.pendingBackLink} data-testid="back-to-login-link">
          ← Quay về trang đăng nhập
        </Link>
      </div>
    )
  }

  // ── Registration Form ────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate data-testid="register-form">
      {/* AC-5: Mock mode banner */}
      <div className={styles.mockBanner} data-testid="mock-mode-banner" role="note">
        ⚠ Chế độ demo — chưa kết nối BE Keycloak
      </div>

      <div className={styles.form}>
        {/* Họ tên */}
        <div className={styles.field}>
          <label htmlFor="reg-fullname" className={styles.label}>
            Họ và tên <span aria-hidden="true">*</span>
          </label>
          <input
            id="reg-fullname"
            data-testid="input-fullname"
            type="text"
            autoComplete="name"
            className={`${styles.input} ${errors.fullName ? styles.inputError : ''}`}
            placeholder="VD: Nguyễn Văn An"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-describedby={errors.fullName ? 'err-fullname' : undefined}
            aria-invalid={!!errors.fullName}
          />
          {errors.fullName && (
            <p id="err-fullname" className={styles.fieldError} role="alert" data-testid="error-fullname">
              {errors.fullName}
            </p>
          )}
        </div>

        {/* Số điện thoại */}
        <div className={styles.field}>
          <label htmlFor="reg-phone" className={styles.label}>
            Số điện thoại <span aria-hidden="true">*</span>
          </label>
          <input
            id="reg-phone"
            data-testid="input-phone"
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
            placeholder="VD: 0901234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-describedby={errors.phone ? 'err-phone' : undefined}
            aria-invalid={!!errors.phone}
          />
          {errors.phone && (
            <p id="err-phone" className={styles.fieldError} role="alert" data-testid="error-phone">
              {errors.phone}
            </p>
          )}
        </div>

        {/* Chọn HTX */}
        <div className={styles.field}>
          <label htmlFor="reg-htx" className={styles.label}>
            Hợp tác xã <span aria-hidden="true">*</span>
          </label>
          <select
            id="reg-htx"
            data-testid="select-htx"
            className={styles.select}
            value={htxId}
            onChange={(e) => setHtxId(e.target.value)}
            aria-describedby={errors.htxId ? 'err-htx' : undefined}
            aria-invalid={!!errors.htxId}
          >
            <option value="">-- Chọn HTX của bạn --</option>
            {MOCK_HTX_LIST.map((htx) => (
              <option key={htx.id} value={htx.id}>
                {htx.name}
              </option>
            ))}
          </select>
          {errors.htxId && (
            <p id="err-htx" className={styles.fieldError} role="alert" data-testid="error-htx">
              {errors.htxId}
            </p>
          )}
        </div>

        {/* Mã PIN */}
        <div className={styles.field}>
          <label htmlFor="reg-pin" className={styles.label}>
            Tạo mã PIN (6 số) <span aria-hidden="true">*</span>
          </label>
          <input
            id="reg-pin"
            data-testid="input-pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
            className={`${styles.input} ${errors.pin ? styles.inputError : ''}`}
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-describedby={errors.pin ? 'err-pin' : undefined}
            aria-invalid={!!errors.pin}
          />
          {errors.pin && (
            <p id="err-pin" className={styles.fieldError} role="alert" data-testid="error-pin">
              {errors.pin}
            </p>
          )}
        </div>

        {/* Xác nhận PIN */}
        <div className={styles.field}>
          <label htmlFor="reg-confirm-pin" className={styles.label}>
            Xác nhận mã PIN <span aria-hidden="true">*</span>
          </label>
          <input
            id="reg-confirm-pin"
            data-testid="input-confirm-pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
            className={`${styles.input} ${errors.confirmPin ? styles.inputError : ''}`}
            placeholder="••••••"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            aria-describedby={errors.confirmPin ? 'err-confirm-pin' : undefined}
            aria-invalid={!!errors.confirmPin}
          />
          {errors.confirmPin && (
            <p id="err-confirm-pin" className={styles.fieldError} role="alert" data-testid="error-confirm-pin">
              {errors.confirmPin}
            </p>
          )}
        </div>

        {/* Consent checkbox — AC-1 */}
        <div className={styles.field}>
          <div className={styles.consentRow}>
            <input
              id="reg-consent"
              data-testid="checkbox-consent"
              type="checkbox"
              className={styles.checkbox}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-describedby={errors.consent ? 'err-consent' : undefined}
              aria-invalid={!!errors.consent}
            />
            <label htmlFor="reg-consent" className={styles.consentLabel}>
              Tôi đồng ý với{' '}
              <a href="#" onClick={(e) => e.preventDefault()}>
                điều khoản sử dụng
              </a>{' '}
              và cho phép HTX quản lý dữ liệu canh tác của tôi.
            </label>
          </div>
          {errors.consent && (
            <p id="err-consent" className={styles.fieldError} role="alert" data-testid="error-consent">
              {errors.consent}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className={styles.submitButton}
          isLoading={state === 'loading'}
          data-testid="register-submit-btn"
        >
          Đăng ký tài khoản
        </Button>

        <p className={styles.loginLink}>
          Đã có tài khoản?{' '}
          <Link href="/login" data-testid="login-link">
            Đăng nhập
          </Link>
        </p>
      </div>
    </form>
  )
}
