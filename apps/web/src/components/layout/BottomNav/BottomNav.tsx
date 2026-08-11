'use client'

import * as React from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './BottomNav.module.css'
import { NavItem } from '../Sidebar/Sidebar'

export interface BottomNavProps {
  navItems: NavItem[]
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export const BottomNav: React.FC<BottomNavProps> = ({ navItems }) => {
  const pathname = usePathname()

  return (
    <nav className={styles.bottomNav} data-testid="bottom-nav">
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
  )
}
