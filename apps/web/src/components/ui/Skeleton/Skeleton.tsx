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
    const customStyle: React.CSSProperties & Record<string, any> = { ...style }
    if (width !== undefined) {
      customStyle['--skeleton-width'] = typeof width === 'number' || /^\d+$/.test(String(width)) ? `${width}px` : width
    }
    if (height !== undefined) {
      customStyle['--skeleton-height'] = typeof height === 'number' || /^\d+$/.test(String(height)) ? `${height}px` : height
    }
    return (
      <div
        ref={ref}
        className={`${styles.skeleton} ${styles[variant]} ${className || ''}`}
        style={customStyle}
        role="presentation"
        aria-hidden="true"
        {...props}
      />
    )
  }
)
Skeleton.displayName = 'Skeleton'
