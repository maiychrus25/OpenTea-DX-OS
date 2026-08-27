// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useTransition } from 'react'
import { signOutAction } from '@/app/actions/signout-action'
import { Button } from '@/components/ui'
import styles from './account-section.module.css'

export type RoleType = 'manager' | 'officer' | 'farmer'

export interface AccountSectionProps {
  name: string
  role: RoleType
}

export const getRoleLabel = (role: RoleType) => {
  switch (role) {
    case 'manager':
      return 'Trưởng HTX'
    case 'officer':
      return 'Cán bộ KT/CL'
    case 'farmer':
      return 'Nông dân'
    default:
      return 'Thành viên'
  }
}

export const getInitials = (name: string) => {
  if (!name || name.trim() === '') return 'U'
  return name.trim().charAt(0).toUpperCase()
}

export function AccountSection({ name, role }: AccountSectionProps) {
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await signOutAction()
    })
  }

  return (
    <section aria-label="Tài khoản cá nhân" className={styles.accountSection}>
      <h2 className={styles.sectionTitle}>Tài khoản cá nhân</h2>
      
      <div className={styles.avatarBlock}>
        <div className={styles.avatarCircle}>{getInitials(name)}</div>
        <div className={styles.nameBlock}>
          <div className={styles.name}>{name || 'Unknown'}</div>
          <div className={styles.roleBadge}>{getRoleLabel(role)}</div>
        </div>
      </div>

      <div className={styles.securityList}>
        <div className={styles.securityRow}>
          <div className={styles.securityRowLabel}>Vân tay / FaceID</div>
          <div className={styles.securityRowRight}>
            <span className={`${styles.statusBadge} ${styles.statusBadgeGreen}`}>
              Đang sử dụng
            </span>
          </div>
        </div>

        <div className={styles.securityRow}>
          <div className={styles.securityRowLabel}>Mã PIN 6 số</div>
          <div className={styles.securityRowRight}>
            <button className={styles.securityBtn} type="button">Đổi PIN</button>
          </div>
        </div>

        <div className={styles.securityRow}>
          <div className={styles.securityRowLabel}>Thiết bị đăng nhập</div>
          <div className={styles.securityRowRight}>
            <button className={styles.securityBtn} type="button">Quản lý</button>
          </div>
        </div>
      </div>

      <Button
        className={styles.logoutBtn}
        onClick={handleLogout}
        disabled={isPending}
        variant="secondary"
      >
        {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
      </Button>
    </section>
  )
}
