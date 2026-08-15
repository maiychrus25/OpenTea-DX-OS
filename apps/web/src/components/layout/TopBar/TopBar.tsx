// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import styles from './TopBar.module.css'
import { Menu, Search } from 'lucide-react'
import { NotificationBell } from '@/components/ui'

export interface TopBarProps {
  role: string
  roleName: string
  userName: string
  notificationSlot?: React.ReactNode
  onMenuClick?: () => void
}

export const TopBar: React.FC<TopBarProps> = ({ role, roleName, userName, notificationSlot, onMenuClick }) => {
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
          <span className={styles.brandMobile}>DX-AgriMarket</span>
        </div>
        <div className={styles.rolePill}>{roleName}</div>
      </div>

      <div className={styles.searchWrap}>
        <Search size={18} className={styles.searchIcon} />
        <input type="text" placeholder="Tìm kiếm..." aria-label="Tìm kiếm" className={styles.searchInput} />
      </div>

      <div className={styles.right}>
        {notificationSlot ? (
          notificationSlot
        ) : (
          <NotificationBell role={role} />
        )}
        <div className={styles.avatar} aria-label={`Người dùng: ${userName}`}>
          {initials}
        </div>
      </div>
    </header>
  )
}
