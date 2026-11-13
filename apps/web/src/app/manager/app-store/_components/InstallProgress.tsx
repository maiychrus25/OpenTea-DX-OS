// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AppStoreStatus, InstallPhase } from '@/domain/entities/app-store'
import styles from './AppStoreDetail.module.css'
import { WORKER_WARNING } from './store-labels'

const STEPS = ['Đã gửi yêu cầu', 'Chuẩn bị', 'Dựng và khởi động', 'Đăng ký']
// The request is step 0; a phase is the step the worker reported last.
const PHASE_STEP: Record<InstallPhase, number> = { prepare: 1, build: 2, register: 3 }
const FAILURE_GUIDANCE: Record<InstallPhase | 'none', string> = {
  prepare: 'Ứng dụng không qua được bước kiểm tra hoặc tạo kho dữ liệu. Quản trị máy chủ xem nhật ký của ./dxos worker.',
  build: 'Ứng dụng không dựng hoặc không khởi động được. Quản trị máy chủ kiểm tra Docker và nhật ký của ./dxos worker.',
  register: 'Ứng dụng đã chạy nhưng chưa đăng ký được vào cổng. Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.',
  none: 'Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.',
}

interface Props {
  status: AppStoreStatus
  phase: InstallPhase | null
  installedOnServer: boolean
  error: string | null
  workerAlive: boolean
}

export function InstallProgress({ status, phase, installedOnServer, error, workerAlive }: Props) {
  if (status !== 'installing' && status !== 'removing' && status !== 'failed') return null
  if (status === 'removing') return <p className={styles.progressLine}>Đang gỡ khỏi HTX…</p>

  const step = phase ? PHASE_STEP[phase] : null
  const failed = status === 'failed'
  if (step === null && !failed) {
    return installedOnServer ? (
      <p className={styles.progressLine}>Đang bật cho HTX…</p>
    ) : (
      <>
        <p className={styles.progressLine}>Đang chờ trình cài đặt</p>
        {!workerAlive && (
          <p className={styles.notice} role="status">
            {WORKER_WARNING}
          </p>
        )}
      </>
    )
  }

  return (
    <>
      {step !== null && (
        <ol className={styles.steps}>
          {STEPS.map((label, index) => {
            const state = index < step ? 'done' : index > step ? 'todo' : failed ? 'failed' : 'active'
            return (
              <li key={label} className={styles.step} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
                <span className={styles.stepMark} aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'failed' ? '!' : index + 1}
                </span>
                <span>
                  {label}
                  {state === 'failed' && <span className={styles.stepNote}> · Lỗi</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {failed && (
        <p className={styles.failure} role="alert">
          {error && <span className={styles.failureText}>{error} </span>}
          {FAILURE_GUIDANCE[phase ?? 'none']}
        </p>
      )}
    </>
  )
}
