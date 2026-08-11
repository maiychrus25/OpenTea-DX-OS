import * as React from 'react'
import styles from './Badge.module.css'

export type BadgeStatus = 'sowing' | 'tending' | 'harvest-approved' | 'harvested' | 'draft'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus
}

const statusLabels: Record<BadgeStatus, string> = {
  sowing: 'Gieo trồng',
  tending: 'Chăm sóc',
  'harvest-approved': 'Chờ thu hoạch',
  harvested: 'Đã thu hoạch',
  draft: 'Nháp',
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status, ...props }, ref) => {
    const label = statusLabels[status]

    return (
      <span
        ref={ref}
        className={`${styles.badge} ${styles[status]} ${className || ''}`}
        role="status"
        aria-label={`Trạng thái: ${label}`}
        data-testid={`badge-${status}`}
        {...props}
      >
        {label}
      </span>
    )
  }
)
Badge.displayName = 'Badge'
