// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { LayoutGrid } from 'lucide-react'
import styles from './AppStoreClient.module.css'
import { ICONS } from './store-labels'

export function StoreAppIcon({ name, size = 'md' }: { name: string | null; size?: 'md' | 'lg' }) {
  const Icon = (name && Object.hasOwn(ICONS, name) ? ICONS[name] : null) ?? LayoutGrid
  return (
    <span className={size === 'lg' ? `${styles.icon} ${styles.iconLarge}` : styles.icon} aria-hidden="true">
      <Icon size={size === 'lg' ? 28 : 20} />
    </span>
  )
}
