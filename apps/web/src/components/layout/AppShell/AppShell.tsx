import * as React from 'react'
import styles from './AppShell.module.css'
import { Sidebar, NavItem } from '../Sidebar/Sidebar'
import { TopBar } from '../TopBar/TopBar'
import { BottomNav } from '../BottomNav/BottomNav'
import { Toaster } from 'sonner'

// Dummy role setup until auth is integrated
const getNavItemsForRole = (_role: string): NavItem[] => {
  // We don't have lucide-react icons rendered here natively yet, but we will pass placeholders or real ones
  // To avoid Client Component in Server Component if not needed, we assume icons are passed as React nodes
  return [
    { label: 'Tổng quan', href: '/dashboard', icon: <span /> },
    { label: 'Bản tin', href: '/bulletin', icon: <span /> }
  ]
}

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
      <Toaster position="top-right" richColors />
    </div>
  )
}
