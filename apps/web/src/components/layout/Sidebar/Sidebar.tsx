// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronsLeft, ChevronsRight, ChevronsUpDown, CircleHelp, LogOut, Map, Moon, Phone, Sprout, Sun, User, X } from 'lucide-react'
import { applyTheme, readStoredTheme, type ThemeChoice } from '@/components/ui/ThemeToggle/theme'
import styles from './Sidebar.module.css'
import { signOutAction } from '@/app/actions/signout-action'
import { RoleSwitcher } from '@/components/layout/RoleSwitcher'
import { ROLE_LABELS, isHumanRole, type HumanRole } from '@/lib/auth/roles'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number | string
  group?: string
  /** Other paths this entry covers, so it stays highlighted there. */
  match?: string[]
  /** Not listed in the menu, only used to name its page. */
  hidden?: boolean
}

export interface SidebarProps {
  navItems: NavItem[]
  htxName?: string
  htxLocation?: string
  isOpen?: boolean
  onClose?: () => void
  userName?: string
  role?: string
  /** Every role of the account; the role switcher shows with two or more. */
  roles?: HumanRole[]
  phone?: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const getRoleLabel = (role?: string): string => (isHumanRole(role) ? ROLE_LABELS[role] : role || '')

export const Sidebar: React.FC<SidebarProps> = ({ 
  navItems, 
  htxName, 
  htxLocation, 
  isOpen = false, 
  onClose,
  userName = 'Unknown',
  role,
  roles,
  phone,
  collapsed = false,
  onToggleCollapsed
}) => {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const profileRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ThemeChoice>('system')
  useEffect(() => setTheme(readStoredTheme()), [])
  const chooseTheme = (choice: ThemeChoice) => {
    applyTheme(choice)
    setTheme(choice)
  }

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
    .filter((item) => [item.href, ...(item.match ?? [])].some((href) => isActive(pathname, href)))
    .reduce<string | null>((best, item) => (best === null || item.href.length > best.length ? item.href : best), null)

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''} ${collapsed ? styles.rail : ''}`} data-testid="sidebar">
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandIcon}><Sprout size={24} aria-hidden="true" /></span>
        <div className={styles.brandText}>
          <strong>OpenTea <span>DX-OS</span></strong>
          <small>Nông nghiệp minh bạch</small>
        </div>
        {onToggleCollapsed && (
          <button type="button" className={styles.fold} onClick={onToggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
            {collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
          </button>
        )}
        {onClose && (
          <button className={styles.closeMenu} onClick={onClose} aria-label="Đóng menu">
            <X size={20} />
          </button>
        )}
      </div>

      {/* The cooperative. Farmers get no card: their name and role stand at the foot of the menu. */}
      {role !== 'farmer' && (
        <div className={styles.coop}>
          <span className={styles.coopBadge}>HTX</span>
          <div className={styles.coopText}>
            <strong>{htxName || 'Đang tải...'}</strong>
            <small>{htxLocation || '---'}</small>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className={styles.nav} aria-label="Điều hướng chính">
        {navItems.filter((item) => !item.hidden).map((item, index, shown) => {
          const active = item.href === activeHref
          return (
            <React.Fragment key={item.href}>
            {item.group && item.group !== shown[index - 1]?.group && (
              <span className={styles.groupTitle}>{item.group}</span>
            )}
            <Link
              href={item.href}
              onClick={onClose}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
              data-tip={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.badge != null && <span className={styles.navBadge}>{item.badge}</span>}
            </Link>
            </React.Fragment>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sidebarFoot}>
        <div className={styles.profileWrapper} ref={profileRef}>
          {profileOpen && (
            <div className={styles.profilePopup}>
              <div className={styles.popupHead}>
                <span className={styles.avatar}>{initials}</span>
                <span>
                  <strong>{userName}</strong>
                  <small>{phone || getRoleLabel(role)}</small>
                </span>
              </div>
              {roles && roles.length >= 2 && isHumanRole(role) && <RoleSwitcher roles={roles} active={role} />}
              <Link href={`/${role || 'farmer'}/profile`} className={styles.popupItem} onClick={() => setProfileOpen(false)}>
                <User size={17} aria-hidden="true" />Tài khoản của tôi
              </Link>
              {role === 'farmer' && (
                <Link href="/farmer/profile" className={styles.popupItem} onClick={() => setProfileOpen(false)}>
                  <Map size={17} aria-hidden="true" />Thửa chè của tôi
                </Link>
              )}
              <Link href={`/${role || 'farmer'}/notifications`} className={styles.popupItem} onClick={() => setProfileOpen(false)}>
                <Bell size={17} aria-hidden="true" />Thông báo
              </Link>
              <div className={styles.popupItem}>
                {theme === 'dark' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
                Giao diện
                <span className={styles.themes} role="group" aria-label="Giao diện">
                  <button type="button" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>Sáng</button>
                  <button type="button" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>Tối</button>
                </span>
              </div>
              {role === 'farmer' && (
                <>
                  <Link href="/farmer/handbook" className={styles.popupItem} onClick={() => setProfileOpen(false)}>
                    <CircleHelp size={17} aria-hidden="true" />Hướng dẫn sử dụng
                  </Link>
                  <button type="button" className={styles.popupItem} disabled title="Chưa có số điện thoại cán bộ">
                    <Phone size={17} aria-hidden="true" />Gọi cán bộ kỹ thuật
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.signOutBtn}
                disabled={isPending}
                onClick={() => startTransition(() => signOutAction())}
              >
                <LogOut size={17} aria-hidden="true" />
                {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </button>
            </div>
          )}
          <button type="button" className={styles.profile} aria-expanded={profileOpen} onClick={() => setProfileOpen(prev => !prev)}>
            <span className={styles.avatar}>{initials}<i aria-hidden="true" /></span>
            <span className={styles.profileText}>
              <strong>{userName}</strong>
              <small>{getRoleLabel(role)}</small>
            </span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  )
}
