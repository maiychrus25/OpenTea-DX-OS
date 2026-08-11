import * as React from 'react'
import styles from './Button.module.css'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        {...props}
        ref={ref}
        type={props.type || 'button'}
        className={`${styles.button} ${styles[variant]} ${styles[size]} ${className || ''}`}
        disabled={disabled || isLoading}
        data-testid={`button-${variant}`}
        aria-busy={isLoading || props['aria-busy']}
        aria-label={props['aria-label']}
      >
        {isLoading && (
          <span className={styles.spinner} aria-hidden="true" />
        )}
        <span className={isLoading ? styles.hiddenContent : ''}>
          {children}
        </span>
      </button>
    )
  }
)
Button.displayName = 'Button'
