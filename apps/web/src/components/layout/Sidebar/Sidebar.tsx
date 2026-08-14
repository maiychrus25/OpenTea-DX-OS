// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Leaf, X, ChevronDown } from 'lucide-react'
import styles from './Sidebar.module.css'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

export interface SidebarProps {
  navItems: NavItem[]
  htxName?: string
  htxLocation?: string
  isOpen?: boolean
  onClose?: () => void
  userName?: string
  role?: string
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const getRoleLabel = (role?: string): string => {
  switch (role) {
    case 'farmer': return 'Nông dân'
    case 'manager': return 'Trưởng HTX'
    case 'officer': return 'Cán bộ KT'
    default: return role || ''
  }
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  navItems, 
  htxName, 
  htxLocation, 
  isOpen = false, 
  onClose,
  userName = 'Unknown',
  role
}) => {
  const pathname = usePathname()
  
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`} data-testid="sidebar">
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandIcon}><Leaf size={24} /></span>
        <div className={styles.brandText}>
          <strong>DX AgriMarket</strong>
          <small>Nông nghiệp minh bạch</small>
        </div>
        {onClose && (
          <button className={styles.closeMenu} onClick={onClose} aria-label="Đóng menu">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Coop */}
      <div className={styles.coop}>
        <span className={styles.coopBadge}>HTX</span>
        <div className={styles.coopText}>
          <strong>{htxName || 'Đang tải...'}</strong>
          <small>{htxLocation || '---'}</small>
        </div>
        <ChevronDown size={16} className={styles.coopIcon} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {navItems.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sidebarFoot}>
        <div className={styles.roleLabel}>ĐANG XEM VỚI VAI TRÒ</div>
        <div className={styles.roleSwitch}>
          {getRoleLabel(role)}
        </div>
        <button className={styles.profile}>
          <span className={styles.avatar}>{initials}</span>
          <div className={styles.profileText}>
            <strong>{userName}</strong>
            <small>{getRoleLabel(role)}</small>
          </div>
        </button>
      </div>
    </aside>
  )
}
