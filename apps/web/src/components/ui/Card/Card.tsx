import * as React from 'react'
import styles from './Card.module.css'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'default' | 'none'
}

/**
 * Card Component
 * 
 * Displays content in a container with a subtle shadow and border.
 * Note: Do NOT nest Card components within other Card components.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.card} ${styles[`padding-${padding}`]} ${className || ''}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'
