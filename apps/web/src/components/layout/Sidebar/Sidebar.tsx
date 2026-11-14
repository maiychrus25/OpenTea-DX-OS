// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Leaf, X, ChevronDown } from 'lucide-react'
import styles from './Sidebar.module.css'
import { signOutAction } from '@/app/actions/signout-action'
import { BRAND_NAME } from '@/lib/brand'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number | string
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
  const [profileOpen, setProfileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Only the most specific item is active: a feed entry sits under its app's own menu item.
  const activeHref = navItems
    .filter((item) => isActive(pathname, item.href))
    .reduce<string | null>((best, item) => (best === null || item.href.length > best.length ? item.href : best), null)

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
          <strong>{BRAND_NAME}</strong>
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
          const active = item.href === activeHref
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.badge != null && <span className={styles.navBadge}>{item.badge}</span>}
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
        <div className={styles.profileWrapper} ref={profileRef}>
          {profileOpen && (
            <div className={styles.profilePopup}>
              <div className={styles.popupRoleLabel}>ĐĂNG NHẬP VỚI VAI TRÒ: {getRoleLabel(role).toUpperCase()}</div>
              <Link href={`/${role || 'farmer'}/profile`} className={styles.profilePopupLink} onClick={() => setProfileOpen(false)}>
                Hồ sơ tài khoản
              </Link>
              <button
                className={styles.signOutBtn}
                disabled={isPending}
                onClick={() => startTransition(() => signOutAction())}
              >
                {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </button>
            </div>
          )}
          <button className={styles.profile} onClick={() => setProfileOpen(prev => !prev)}>
            <span className={styles.avatar}>{initials}</span>
            <div className={styles.profileText}>
              <strong>{userName}</strong>
              <small>{getRoleLabel(role)}</small>
            </div>
          </button>
        </div>
      </div>
    </aside>
  )
}
