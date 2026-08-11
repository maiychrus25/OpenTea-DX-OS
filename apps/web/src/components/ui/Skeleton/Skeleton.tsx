import * as React from 'react'
import styles from './Skeleton.module.css'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  variant?: 'text' | 'rect' | 'circle'
}

/**
 * Skeleton Component
 * 
 * Usage:
 * <div aria-busy="true" aria-label="Đang tải...">
 *   <Skeleton variant="text" width="100%" />
 * </div>
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width, height, variant = 'text', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.skeleton} ${styles[variant]} ${className || ''}`}
        style={ { width, height, ...style } }
        {...props}
      />
    )
  }
)
Skeleton.displayName = 'Skeleton'
