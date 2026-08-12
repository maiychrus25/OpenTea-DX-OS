// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import styles from './Badge.module.css'

export type BadgeStatus = 'sowing' | 'tending' | 'harvest-approved' | 'harvested' | 'draft'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus
}

const statusLabels: Record<BadgeStatus, string> = {
  sowing: 'Gieo trá»“ng',
  tending: 'ChÄƒm sÃ³c',
  'harvest-approved': 'Chá» thu hoáº¡ch',
  harvested: 'ÄÃ£ thu hoáº¡ch',
  draft: 'NhÃ¡p',
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status, ...props }, ref) => {
    const label = statusLabels[status]

    return (
      <span
        ref={ref}
        className={`${styles.badge} ${styles[status]} ${className || ''}`}
        role="status"
        aria-label={`Tráº¡ng thÃ¡i: ${label}`}
        data-testid={`badge-${status}`}
        {...props}
      >
        {label}
      </span>
    )
  }
)
Badge.displayName = 'Badge'
