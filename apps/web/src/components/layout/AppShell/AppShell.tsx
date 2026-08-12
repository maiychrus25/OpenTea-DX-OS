// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import styles from './AppShell.module.css'
import { Sidebar, NavItem } from '../Sidebar/Sidebar'
import { TopBar } from '../TopBar/TopBar'
import { BottomNav } from '../BottomNav/BottomNav'
import { Toaster } from 'sonner'


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
  role: string
  userName: string
  navItems: NavItem[]
  hideSidebar?: boolean
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  role, 
  userName,
  navItems,
  hideSidebar = false
}) => {

  return (
    <div className={styles.shell} data-role={role}>
      {!hideSidebar && <Sidebar navItems={navItems} />}
      
      <main className={styles.content}>
        <TopBar roleName={getRoleLabel(role)} userName={userName} />
        <div className={styles.pageContent}>
          {children}
        </div>
      </main>

      <BottomNav navItems={navItems} />
      <Toaster position="top-right" richColors />
    </div>
  )
}
