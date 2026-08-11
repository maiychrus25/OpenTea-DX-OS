'use client'

import * as React from 'react'
import { useEffect, useId, useRef } from 'react'
import FocusTrap from 'focus-trap-react'
import styles from './Modal.module.css'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

let modalCount = 0
let originalOverflow = ''

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  headingLevel: Heading = 'h2',
}) => {
  const titleId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)

  // Store trigger element before opening to restore focus on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null
    } else if (triggerRef.current) {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [isOpen])

  // Body scroll lock with stacking counter
  useEffect(() => {
    if (isOpen) {
      modalCount++
      if (modalCount === 1) {
        originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
    }
    return () => {
      if (isOpen) {
        modalCount--
        if (modalCount <= 0) {
          modalCount = 0
          document.body.style.overflow = originalOverflow
        }
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <FocusTrap
      active={isOpen}
      focusTrapOptions={{
        onDeactivate: onClose,
        allowOutsideClick: true,
        clickOutsideDeactivates: false,
        escapeDeactivates: true,
      }}
    >
      <div className={styles.overlay} onClick={onClose}>
        <div
          className={`${styles.modal} ${styles[size]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={!title ? 'Hộp thoại' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.header}>
            {title && (
              <Heading id={titleId} className={styles.title}>
                {title}
              </Heading>
            )}
            <button className={styles.closeButton} onClick={onClose} aria-label="Đóng">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </FocusTrap>
  )
}
