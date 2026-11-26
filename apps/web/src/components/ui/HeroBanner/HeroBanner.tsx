// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import styles from './HeroBanner.module.css'

export interface HeroAction {
  label: string
  href: string
  icon?: React.ReactNode
}

export interface HeroBannerProps {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: HeroAction[]
}

// The first action is the lime one, the rest are outlined.
export function HeroBanner({ eyebrow, title, subtitle, actions = [] }: HeroBannerProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.photo} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action, index) => (
              <Link key={action.label} href={action.href} className={index === 0 ? styles.primary : styles.secondary}>
                {action.icon}
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
