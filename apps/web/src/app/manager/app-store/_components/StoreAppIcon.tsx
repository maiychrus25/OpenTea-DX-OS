// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import styles from './AppStoreClient.module.css'
import { appIcon } from '@/lib/apps/app-icons'

export function StoreAppIcon({ name, size = 'md' }: { name: string | null; size?: 'md' | 'lg' }) {
  const Icon = appIcon(name)
  return (
    <span className={size === 'lg' ? `${styles.icon} ${styles.iconLarge}` : styles.icon} aria-hidden="true">
      <Icon size={size === 'lg' ? 28 : 20} />
    </span>
  )
}
