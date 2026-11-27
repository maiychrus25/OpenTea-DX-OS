// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import styles from './TopBar.module.css'
import { Home, Menu } from 'lucide-react'
import { NotificationBell } from '@/components/ui'
import { GlobalSearchInput } from '@/components/ui/GlobalSearch/GlobalSearchInput'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { BRAND_NAME } from '@/lib/brand'

export interface TopBarProps {
  role: string
  roleName: string
  userName: string
  notificationSlot?: React.ReactNode
  onMenuClick?: () => void
  pageName?: string
}

export const TopBar: React.FC<TopBarProps> = ({ role, roleName, userName, notificationSlot, onMenuClick, pageName }) => {
  // Get initials for avatar
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        {onMenuClick && (
          <button className={styles.menuButton} onClick={onMenuClick} aria-label="Mở menu" data-testid="menu-button">
            <Menu size={24} />
          </button>
        )}
        <div className={styles.pageTitle}>
          <span className={styles.brandMobile}>{BRAND_NAME}</span>
        </div>
        <nav className={styles.breadcrumb} aria-label="Đường dẫn">
          <Home size={18} aria-hidden="true" />
          <span>Không gian HTX</span>
          <span aria-hidden="true">/</span>
          <strong aria-current="page">{pageName || roleName}</strong>
        </nav>
      </div>

      {(role === 'manager' || role === 'officer') && <GlobalSearchInput role={role} />}

      <div className={styles.right}>
        <ThemeToggle />
        {/* The platform admin has no HTX, so there is nothing to notify and the notification API would answer 403. */}
        {role !== 'platform_admin' && (notificationSlot ?? <NotificationBell role={role} />)}
        <div className={styles.avatar} aria-label={`Người dùng: ${userName}`}>
          {initials}
        </div>
      </div>
    </header>
  )
}
