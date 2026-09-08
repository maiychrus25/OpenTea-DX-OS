// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import * as React from 'react'
import { useEffect, useId, useRef } from 'react'
import FocusTrap from 'focus-trap-react'
import { X } from 'lucide-react'
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <FocusTrap
      active={isOpen}
      focusTrapOptions={{
        allowOutsideClick: true,
        clickOutsideDeactivates: false,
        fallbackFocus: () => (typeof document !== 'undefined' ? document.body : undefined) as any,
        tabbableOptions: {
          displayCheck: 'none',
        },
        escapeDeactivates: () => {
          onClose()
          return true
        },
      }}
    >
      <div
        className={styles.overlay}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
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
            <button className={styles.closeButton} onClick={onClose} aria-label="Đóng" type="button">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </FocusTrap>
  )
}
