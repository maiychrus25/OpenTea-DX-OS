import * as React from 'react'
import styles from './TopBar.module.css'


export interface TopBarProps {
  roleName: string
  userName: string
  notificationSlot?: React.ReactNode
}

export const TopBar: React.FC<TopBarProps> = ({ roleName, userName, notificationSlot }) => {
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
        <div className={styles.logo}>
          <span className={styles.brand}>DX-AgriMarket</span>
        </div>
        <div className={styles.roleBadge}>
          {/* We use a generic styling for role, Badge is technically for parcel status, 
              but we can create a custom pill here or use a generic span */}
          <span className={styles.rolePill}>{roleName}</span>
        </div>
      </div>
      <div className={styles.right}>
        {notificationSlot ? (
          notificationSlot
        ) : (
          <div data-slot="notification-bell" className={styles.bellPlaceholder}>
            {/* Empty placeholder to be wired in Story 2.7 */}
          </div>
        )}
        <div className={styles.avatar} aria-label={`Người dùng: ${userName}`}>
          {initials}
        </div>
      </div>
    </header>
  )
}
