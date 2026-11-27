// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import { auth } from '@/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Clock, Lock } from 'lucide-react'
import { heldRoles, homeFor, isHumanRole } from '@/lib/auth/roles'
import { SwitchRoleButton } from './SwitchRoleButton'
import styles from './Unauthorized.module.css'

interface UnauthorizedPageProps {
  searchParams: Promise<{ state?: string; switch?: string }>
}

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const session = await auth()
  const role = session?.user?.role
  const { state, switch: switchTarget } = await searchParams

  const redirectUrl = role ? homeFor(role) : '/'
  // The button shows only for a role the session holds; the switch API checks it again.
  const switchRole =
    isHumanRole(switchTarget) && switchTarget !== role && heldRoles(session?.user ?? {}).includes(switchTarget)
      ? switchTarget
      : undefined

  // AC-4: Pending account state
  if (state === 'pending') {
    return (
      <div className={styles.container} data-testid="state-pending">
        <Card padding="default">
          <div className={styles.content}>
            <div className={styles.stateIcon} aria-hidden="true">
              <Clock size={48} className="text-warning mx-auto" />
            </div>
            <h1 className={styles.stateTitlePending}>Tài khoản chờ phê duyệt</h1>
            <p className={styles.description}>
              Tài khoản của bạn đã được tạo nhưng đang chờ Trưởng HTX phê duyệt.
              Vui lòng liên hệ HTX của bạn để được kích hoạt sớm hơn.
            </p>
            <Link href="/login">
              <Button variant="secondary" data-testid="back-to-login-btn">
                Về trang đăng nhập
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // AC-4: Locked account state
  if (state === 'locked') {
    return (
      <div className={styles.container} data-testid="state-locked">
        <Card padding="default">
          <div className={styles.content}>
            <div className={styles.stateIcon} aria-hidden="true">
              <Lock size={48} className="text-danger mx-auto" />
            </div>
            <h1 className={styles.stateTitleLocked}>Tài khoản bị khóa</h1>
            <p className={styles.description}>
              Tài khoản của bạn đã bị khóa do nhập sai PIN quá nhiều lần.
              
            </p>
            <p className={styles.description} data-testid="locked-forgot-pin-note">Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại.</p>
            <Link href="/login" className={styles.secondaryLink}>
              Quay về đăng nhập
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Default: 403 Unauthorized
  return (
    <div className={styles.container} data-testid="state-unauthorized">
      <Card padding="default">
        <div className={styles.content}>
          <h1 className={styles.title}>403 — Không có quyền truy cập</h1>
          <p className={styles.description}>
            Bạn không có quyền truy cập vào trang này dựa trên chức vụ của bạn.
          </p>
          {switchRole && <SwitchRoleButton role={switchRole} />}
          <Link href={redirectUrl}>
            <Button variant="primary" data-testid="back-to-role-btn">
              Về trang phù hợp
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
