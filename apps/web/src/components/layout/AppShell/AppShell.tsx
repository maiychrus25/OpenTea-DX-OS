// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import styles from './AppShell.module.css'
import { Sidebar, NavItem } from '../Sidebar/Sidebar'
import { TopBar } from '../TopBar/TopBar'
import { BottomNav } from '../BottomNav/BottomNav'
import { Toaster } from 'sonner'


const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'farmer': return 'Nông dân'
    case 'manager': return 'Trưởng HTX'
    case 'officer': return 'Cán bộ KT'
    default: return role
  }
}

export interface AppShellProps {
  children: React.ReactNode
  role: string
  userName: string
  navItems: NavItem[]
  hideSidebar?: boolean
  htxName?: string
  htxLocation?: string
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  role, 
  userName,
  navItems,
  hideSidebar = false,
  htxName,
  htxLocation
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.shell} data-role={role}>
      {/* Mobile Backdrop */}
      {sidebarOpen && !hideSidebar && (
        <button 
          className={styles.backdrop} 
          onClick={() => setSidebarOpen(false)} 
          aria-label="Đóng menu" 
          data-testid="backdrop"
        />
      )}

      {!hideSidebar && (
        <Sidebar 
          navItems={navItems} 
          htxName={htxName} 
          htxLocation={htxLocation} 
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userName={userName}
          role={role}
        />
      )}
      
      <div className={styles.workspace}>
        <main className={styles.content}>
          <TopBar 
            role={role}
            roleName={getRoleLabel(role)} 
            userName={userName} 
            onMenuClick={!hideSidebar ? () => setSidebarOpen(true) : undefined}
          />
          <div className={styles.pageContent}>
            {children}
          </div>
        </main>

        <BottomNav navItems={navItems} />
      </div>
      <Toaster position="top-right" richColors />
    </div>
  )
}
