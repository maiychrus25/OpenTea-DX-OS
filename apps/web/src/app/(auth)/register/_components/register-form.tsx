// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import { Clock, ArrowLeft, Eye, EyeOff, Lock, Phone, User, Users } from 'lucide-react'
import styles from '../register.module.css'
import {
  validateFullName,
  validatePhone,
  validatePin,
  validatePinMatch,
} from '@/lib/auth-validation'

export interface HtxOption {
  id: string
  name: string
}

interface FormErrors {
  fullName?: string
  phone?: string
  htxId?: string
  pin?: string
  confirmPin?: string
  consent?: string
}

type FormState = 'idle' | 'loading' | 'pending-approval'

export function RegisterForm({ htxList }: { htxList: HtxOption[] }) {
  const [state, setState] = useState<FormState>('idle')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [htxId, setHtxId] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPin, setShowPin] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

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

    setState('loading')
    
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, htxId, pin })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Đã có lỗi xảy ra khi đăng ký')
      }

      setState('pending-approval')
    } catch (err: any) {
      setErrors(prev => ({ ...prev, phone: err.message }))
      setState('idle')
    }
  }

  // ── Pending Approval State (AC-1) ───────────────────────────────────────────
  if (state === 'pending-approval') {
    return (
      <div className={styles.pendingState} data-testid="pending-approval-state">
        <div className={styles.pendingIcon} aria-hidden="true">
          <Clock size={48} className="text-warning mx-auto" />
        </div>
        <h3 className={styles.pendingTitle}>Đang chờ phê duyệt</h3>
        <p className={styles.pendingDesc}>
          Yêu cầu đăng ký của <strong>{fullName}</strong> đã được ghi nhận.
          Trưởng HTX sẽ phê duyệt tài khoản của bạn trong vòng 1–2 ngày làm việc.
        </p>
        <p className={styles.pendingDesc} style={{ fontSize: '0.8125rem', opacity: 0.7 }}>
          Sau khi được phê duyệt, bạn sẽ nhận được thông báo qua số điện thoại đã đăng ký.
        </p>
        <Link href="/login" className={styles.pendingBackLink} data-testid="back-to-login-link">
          <ArrowLeft size={16} className="inline mr-1 align-text-bottom" /> Quay về trang đăng nhập
        </Link>
      </div>
    )
  }

  // ── Registration Form ────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate data-testid="register-form">
      {/* Real connection to Keycloak enabled */}

      <div className={styles.form}>
        {/* Chọn HTX */}
        <div className={styles.field}>
          <label htmlFor="reg-htx" className={styles.label}>
            Loại tài khoản<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <Users size={17} aria-hidden="true" />
            <select
              id="reg-htx"
              data-testid="select-htx"
              className={styles.select}
              value={htxId}
              onChange={(e) => setHtxId(e.target.value)}
              aria-describedby={errors.htxId ? 'err-htx' : undefined}
              aria-invalid={!!errors.htxId}
            >
              <option value="">Hợp tác xã</option>
              {htxList.map((htx) => (
                <option key={htx.id} value={htx.id}>
                  {htx.name}
                </option>
              ))}
            </select>
          </div>
          {errors.htxId && (
            <p id="err-htx" className={styles.fieldError} role="alert" data-testid="error-htx">
              {errors.htxId}
            </p>
          )}
        </div>

        <div className={styles.pair}>
        {/* Họ tên */}
        <div className={styles.field}>
          <label htmlFor="reg-fullname" className={styles.label}>
            Họ và tên<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <User size={17} aria-hidden="true" />
            <input
              id="reg-fullname"
              data-testid="input-fullname"
              type="text"
              autoComplete="name"
              className={`${styles.input} ${errors.fullName ? styles.inputError : ''}`}
              placeholder="Nhập họ và tên"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-describedby={errors.fullName ? 'err-fullname' : undefined}
              aria-invalid={!!errors.fullName}
            />
          </div>
          {errors.fullName && (
            <p id="err-fullname" className={styles.fieldError} role="alert" data-testid="error-fullname">
              {errors.fullName}
            </p>
          )}
        </div>

        {/* Số điện thoại */}
        <div className={styles.field}>
          <label htmlFor="reg-phone" className={styles.label}>
            Số điện thoại<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <Phone size={17} aria-hidden="true" />
            <input
              id="reg-phone"
              data-testid="input-phone"
              type="tel"
              autoComplete="tel"
              inputMode="numeric"
              className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
              placeholder="Nhập số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby={errors.phone ? 'err-phone' : undefined}
              aria-invalid={!!errors.phone}
            />
          </div>
          {errors.phone && (
            <p id="err-phone" className={styles.fieldError} role="alert" data-testid="error-phone">
              {errors.phone}
            </p>
          )}
        </div>
        </div>

        {/* The phone number is the login name, so it is shown here rather than typed twice. */}
        <div className={styles.field}>
          <label htmlFor="reg-username" className={styles.label}>
            Tên đăng nhập<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <User size={17} aria-hidden="true" />
            <input id="reg-username" className={styles.input} type="text" value={phone} readOnly placeholder="Tự lấy theo số điện thoại" />
          </div>
        </div>

        {/* Mã PIN */}
        <div className={styles.field}>
          <label htmlFor="reg-pin" className={styles.label}>
            Mật khẩu<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <Lock size={17} aria-hidden="true" />
            <input
              id="reg-pin"
              data-testid="input-pin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              className={`${styles.input} ${errors.pin ? styles.inputError : ''}`}
              placeholder="Nhập mật khẩu (6 số)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              aria-describedby={errors.pin ? 'err-pin' : undefined}
              aria-invalid={!!errors.pin}
            />
            <button type="button" className={styles.reveal} aria-label={showPin ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPin} onClick={() => setShowPin(!showPin)}>
              {showPin ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
            </button>
          </div>
          {errors.pin && (
            <p id="err-pin" className={styles.fieldError} role="alert" data-testid="error-pin">
              {errors.pin}
            </p>
          )}
        </div>

        {/* Xác nhận PIN */}
        <div className={styles.field}>
          <label htmlFor="reg-confirm-pin" className={styles.label}>
            Xác nhận mật khẩu<span aria-hidden="true">*</span>
          </label>
          <div className={styles.control}>
            <Lock size={17} aria-hidden="true" />
            <input
              id="reg-confirm-pin"
              data-testid="input-confirm-pin"
              type={showConfirm ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              className={`${styles.input} ${errors.confirmPin ? styles.inputError : ''}`}
              placeholder="Nhập lại mật khẩu"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              aria-describedby={errors.confirmPin ? 'err-confirm-pin' : undefined}
              aria-invalid={!!errors.confirmPin}
            />
            <button type="button" className={styles.reveal} aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showConfirm} onClick={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
            </button>
          </div>
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
              <span>
                Tôi đồng ý với{' '}
                <a href="#" onClick={(e) => e.preventDefault()}>
                  điều khoản sử dụng
                </a>{' '}
                và cho phép HTX quản lý dữ liệu canh tác của tôi.
              </span>
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
          Đăng ký
        </Button>

        <p className={styles.loginLink}>
          Bạn đã có tài khoản?{' '}
          <Link href="/login" data-testid="login-link">
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </form>
  )
}
