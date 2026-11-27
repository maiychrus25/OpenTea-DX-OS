// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ROLE_LABELS, type HumanRole } from '@/lib/auth/roles'
import { useSwitchRole } from './useSwitchRole'
import styles from './RoleSwitcher.module.css'

export interface RoleSwitcherProps {
  roles: HumanRole[]
  active: HumanRole
}

/** One-tap switch between the roles of an account. Shown only with two or more roles; the server decides what is allowed. */
export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ roles, active }) => {
  const { switchTo, pending } = useSwitchRole(toast.error)
  if (roles.length < 2) return null

  return (
    <div className={styles.switcher} role="group" aria-label="Chuyển vai">
      <span className={styles.title}>Chuyển vai</span>
      {roles.map((role) => {
        const isActive = role === active
        return (
          <button
            key={role}
            type="button"
            className={styles.option}
            aria-current={isActive ? 'true' : undefined}
            disabled={pending}
            onClick={() => !isActive && switchTo(role)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {ROLE_LABELS[role]}
          </button>
        )
      })}
    </div>
  )
}
