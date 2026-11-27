// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
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

const COLLAPSED_KEY = 'opentea-menu-collapsed'

export interface AppShellProps {
  children: React.ReactNode
  role: string
  userName: string
  navItems: NavItem[]
  hideSidebar?: boolean
  htxName?: string
  htxLocation?: string
  /** Shown in the account menu. */
  phone?: string
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  role, 
  userName,
  navItems,
  hideSidebar = false,
  htxName,
  htxLocation,
  phone
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // The menu as a narrow rail of icons, remembered in this browser.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {
      // storage blocked: the menu starts open
    }
  }, [])
  const toggleCollapsed = () => {
    setCollapsed(!collapsed)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1')
    } catch {
      // kept for this visit only
    }
  }
  const pathname = usePathname()
  // The most specific menu item that covers this page names it in the breadcrumb.
  const pageName = navItems
    .filter((item) => [item.href, ...(item.match ?? [])].some((href) => pathname === href || pathname?.startsWith(`${href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.label

  return (
    <div className={styles.shell} data-role={role} data-collapsed={collapsed || undefined}>
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
          phone={phone}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      )}
      
      <div className={styles.workspace}>
        <main className={styles.content}>
          <TopBar 
            role={role}
            roleName={getRoleLabel(role)} 
            userName={userName} 
            pageName={pageName}
            onMenuClick={!hideSidebar ? () => setSidebarOpen(true) : undefined}
          />
          <div className={styles.pageContent}>
            {children}
          </div>
        </main>

        {role === 'farmer' && <BottomNav navItems={navItems} />}
      </div>
      <Toaster position="top-right" richColors />
    </div>
  )
}
