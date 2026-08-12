// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import styles from './AppShell.module.css'
import { Sidebar, NavItem } from '../Sidebar/Sidebar'
import { TopBar } from '../TopBar/TopBar'
import { BottomNav } from '../BottomNav/BottomNav'

// Dummy role setup until auth is integrated
const getNavItemsForRole = (_role: string): NavItem[] => {
  // We don't have lucide-react icons rendered here natively yet, but we will pass placeholders or real ones
  // To avoid Client Component in Server Component if not needed, we assume icons are passed as React nodes
  return [
    { label: 'Tá»•ng quan', href: '/dashboard', icon: <span /> },
    { label: 'Báº£n tin', href: '/bulletin', icon: <span /> }
  ]
}

const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'farmer': return 'NÃ´ng dÃ¢n'
    case 'manager': return 'TrÆ°á»Ÿng HTX'
    case 'officer': return 'CÃ¡n bá»™ KT'
    default: return role
  }
}

export interface AppShellProps {
  children: React.ReactNode
  role?: string
  userName?: string
  navItems?: NavItem[] // Optional override
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  role = 'farmer', 
  userName = 'User',
  navItems
}) => {
  const items = navItems || getNavItemsForRole(role)
  
  return (
    <div className={styles.shell} data-role={role}>
      <Sidebar navItems={items} />
      
      <main className={styles.content}>
        <TopBar roleName={getRoleLabel(role)} userName={userName} />
        <div className={styles.pageContent}>
          {children}
        </div>
      </main>

      <BottomNav navItems={items} />
    </div>
  )
}
