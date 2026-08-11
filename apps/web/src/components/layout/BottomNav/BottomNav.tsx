'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './BottomNav.module.css'
import { NavItem } from '../Sidebar/Sidebar'

export interface BottomNavProps {
  navItems: NavItem[]
}

export const BottomNav: React.FC<BottomNavProps> = ({ navItems }) => {
  const pathname = usePathname()

  return (
    <nav className={styles.bottomNav} data-testid="bottom-nav">
      {navItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.active : ''}`}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
