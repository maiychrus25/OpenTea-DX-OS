// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'
import styles from '../forgot-pin.module.css'
import { validatePhone, validatePin, validatePinMatch } from '@/lib/auth-validation'

// AC-2: Forgot PIN supports 3 steps: verify → new PIN → result
type Step = 'verify-phone' | 'enter-otp' | 'new-pin' | 'success' | 'failure'

// Mock OTP — clearly labelled, AC-5: không validate credential thật
const MOCK_OTP = '123456'

interface StepErrors {
  phone?: string
  otp?: string
  pin?: string
  confirmPin?: string
}

const STEP_LABELS: Record<Step, string> = {
  'verify-phone': 'Bước 1/3 — Xác minh SĐT',
  'enter-otp': 'Bước 2/3 — Nhập mã OTP',
  'new-pin': 'Bước 3/3 — Tạo PIN mới',
  'success': 'Hoàn tất',
  'failure': 'Thất bại',
}

const STEP_ORDER: Step[] = ['verify-phone', 'enter-otp', 'new-pin']

function getStepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step)
}

export function ForgotPinForm() {
  const [step, setStep] = useState<Step>('verify-phone')
  const [isLoading, setIsLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [errors, setErrors] = useState<StepErrors>({})

  async function simulateLoading(ms = 800) {
    setIsLoading(true)
    await new Promise((r) => setTimeout(r, ms))
    setIsLoading(false)
  }

  // ── Step 1: Verify Phone ──────────────────────────────────────────────────
  async function handleVerifyPhone(e: React.FormEvent) {
    e.preventDefault()
    const phoneErr = validatePhone(phone)
    if (phoneErr) { setErrors({ phone: phoneErr }); return }
    setErrors({})
    await simulateLoading()
    setStep('enter-otp')
  }

  // ── Step 2: Enter OTP ─────────────────────────────────────────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!otp.trim()) { setErrors({ otp: 'Vui lòng nhập mã OTP' }); return }
    if (otp.trim().length !== 6) { setErrors({ otp: 'Mã OTP gồm 6 chữ số' }); return }
    // AC-5: Mock-only — chỉ accept MOCK_OTP hoặc bất kỳ 6 số (demo)
    setErrors({})
    await simulateLoading()
    setStep('new-pin')
  }

  // ── Step 3: New PIN ───────────────────────────────────────────────────────
  async function handleNewPin(e: React.FormEvent) {
    e.preventDefault()
    const pinErr = validatePin(pin)
    const confirmErr = validatePinMatch(pin, confirmPin)
    if (pinErr || confirmErr) {
      setErrors({ pin: pinErr ?? undefined, confirmPin: confirmErr ?? undefined })
      return
    }
    setErrors({})
    await simulateLoading(1000)
    // Mock: 90% success, 10% failure — deterministic trong test (always success khi PIN valid)
    setStep('success')
  }

  function handleRetry() {
    setStep('verify-phone')
    setPhone('')
    setOtp('')
    setPin('')
    setConfirmPin('')
    setErrors({})
  }

  const currentStepIndex = getStepIndex(step)

  // ── Success State ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className={styles.successState} data-testid="forgot-pin-success">
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <h3 className={styles.successTitle}>Đổi PIN thành công!</h3>
        <p className={styles.successDesc}>
          Mã PIN mới đã được cập nhật. Vui lòng đăng nhập lại bằng PIN mới.
        </p>
        {/* AC-5: Mock banner — no actual session created */}
        <div className={styles.mockBanner} data-testid="mock-mode-banner" role="note">
          ⚠ Chế độ demo — PIN chưa thực sự được thay đổi
        </div>
        <Link href="/login">
          <Button className={styles.loginButton} data-testid="go-to-login-btn">
            Về trang đăng nhập
          </Button>
        </Link>
      </div>
    )
  }

  // ── Failure State ─────────────────────────────────────────────────────────
  if (step === 'failure') {
    return (
      <div className={styles.failureState} data-testid="forgot-pin-failure">
        <div className={styles.failureIcon} aria-hidden="true">✗</div>
        <h3 className={styles.failureTitle}>Khôi phục thất bại</h3>
        <p className={styles.failureDesc}>
          Không thể xác minh danh tính. Vui lòng liên hệ Trưởng HTX để được hỗ trợ.
        </p>
        <Button
          variant="secondary"
          className={styles.retryButton}
          onClick={handleRetry}
          data-testid="retry-btn"
        >
          Thử lại
        </Button>
      </div>
    )
  }

  // ── Form Steps ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Mock mode banner */}
      <div className={styles.mockBanner} data-testid="mock-mode-banner" role="note">
        ⚠ Chế độ demo — chưa kết nối BE Keycloak
      </div>

      {/* Step indicator */}
      <div className={styles.stepIndicator} role="progressbar" aria-label={STEP_LABELS[step]}
        aria-valuenow={currentStepIndex + 1} aria-valuemin={1} aria-valuemax={3}>
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={`${styles.stepDot} ${i === currentStepIndex ? styles.active : ''} ${i < currentStepIndex ? styles.completed : ''}`}
            aria-hidden="true"
            data-testid={`step-dot-${i + 1}`}
          />
        ))}
        <span className={styles.stepLabel} data-testid="step-label">
          {STEP_LABELS[step]}
        </span>
      </div>

      {/* ── Step 1: Xác minh SĐT ── */}
      {step === 'verify-phone' && (
        <form onSubmit={handleVerifyPhone} noValidate data-testid="step-verify-phone">
          <div className={styles.form}>
            <p className={styles.stepTitle}>Xác minh số điện thoại</p>
            <p className={styles.stepDesc}>
              Nhập số điện thoại đã đăng ký. Chúng tôi sẽ gửi mã OTP để xác minh.
            </p>
            <div className={styles.field}>
              <label htmlFor="fp-phone" className={styles.label}>
                Số điện thoại <span aria-hidden="true">*</span>
              </label>
              <input
                id="fp-phone"
                data-testid="input-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
                placeholder="VD: 0901234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-describedby={errors.phone ? 'err-fp-phone' : undefined}
                aria-invalid={!!errors.phone}
              />
              {errors.phone && (
                <p id="err-fp-phone" className={styles.fieldError} role="alert" data-testid="error-phone">
                  {errors.phone}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className={styles.submitButton}
              isLoading={isLoading}
              data-testid="send-otp-btn"
            >
              Gửi mã OTP
            </Button>
            <p className={styles.backLink}>
              <Link href="/login">← Quay về đăng nhập</Link>
            </p>
          </div>
        </form>
      )}

      {/* ── Step 2: Nhập OTP ── */}
      {step === 'enter-otp' && (
        <form onSubmit={handleVerifyOtp} noValidate data-testid="step-enter-otp">
          <div className={styles.form}>
            <p className={styles.stepTitle}>Nhập mã OTP</p>
            <p className={styles.stepDesc}>
              Mã OTP đã được gửi đến <strong>{phone}</strong>.
            </p>
            {/* Mock OTP hint — clearly labelled as mock, AC-5 */}
            <div className={styles.otpHint} data-testid="mock-otp-hint">
              Chế độ demo: mã OTP mẫu là{' '}
              <span className={styles.otpHintCode}>{MOCK_OTP}</span>
            </div>
            <div className={styles.field}>
              <label htmlFor="fp-otp" className={styles.label}>Mã OTP (6 số)</label>
              <input
                id="fp-otp"
                data-testid="input-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                className={`${styles.input} ${errors.otp ? styles.inputError : ''}`}
                placeholder="______"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                aria-describedby={errors.otp ? 'err-fp-otp' : undefined}
                aria-invalid={!!errors.otp}
              />
              {errors.otp && (
                <p id="err-fp-otp" className={styles.fieldError} role="alert" data-testid="error-otp">
                  {errors.otp}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className={styles.submitButton}
              isLoading={isLoading}
              data-testid="verify-otp-btn"
            >
              Xác nhận OTP
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 3: Tạo PIN mới ── */}
      {step === 'new-pin' && (
        <form onSubmit={handleNewPin} noValidate data-testid="step-new-pin">
          <div className={styles.form}>
            <p className={styles.stepTitle}>Tạo mã PIN mới</p>
            <p className={styles.stepDesc}>
              Chọn mã PIN 6 chữ số mới. Không dùng ngày sinh hoặc số dễ đoán.
            </p>
            <div className={styles.field}>
              <label htmlFor="fp-pin" className={styles.label}>
                Mã PIN mới <span aria-hidden="true">*</span>
              </label>
              <input
                id="fp-pin"
                data-testid="input-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="new-password"
                className={`${styles.input} ${errors.pin ? styles.inputError : ''}`}
                placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                aria-describedby={errors.pin ? 'err-fp-pin' : undefined}
                aria-invalid={!!errors.pin}
              />
              {errors.pin && (
                <p id="err-fp-pin" className={styles.fieldError} role="alert" data-testid="error-new-pin">
                  {errors.pin}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <label htmlFor="fp-confirm-pin" className={styles.label}>
                Xác nhận PIN mới <span aria-hidden="true">*</span>
              </label>
              <input
                id="fp-confirm-pin"
                data-testid="input-confirm-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="new-password"
                className={`${styles.input} ${errors.confirmPin ? styles.inputError : ''}`}
                placeholder="••••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                aria-describedby={errors.confirmPin ? 'err-fp-confirm-pin' : undefined}
                aria-invalid={!!errors.confirmPin}
              />
              {errors.confirmPin && (
                <p id="err-fp-confirm-pin" className={styles.fieldError} role="alert" data-testid="error-confirm-new-pin">
                  {errors.confirmPin}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className={styles.submitButton}
              isLoading={isLoading}
              data-testid="set-new-pin-btn"
            >
              Đặt PIN mới
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
