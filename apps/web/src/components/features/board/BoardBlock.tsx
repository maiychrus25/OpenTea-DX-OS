// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import React, { useId } from 'react'
import styles from './board.module.css'

interface Props {
  title: string
  /** Where the block's "more" link goes; the whole block stays readable without it. */
  href?: string
  children: React.ReactNode
  /** A block whose value failed to load shows this text instead of its content. */
  failedText?: string
}

/** One block of the director board: a titled section with its own error state. */
export function BoardBlock({ title, href, children, failedText }: Props) {
  const id = useId()
  return (
    <section className={styles.block} aria-labelledby={id}>
      <div className={styles.blockHead}>
        <h2 id={id} className={styles.blockTitle}>{title}</h2>
        {href && <Link href={href} className={styles.blockLink}>Xem chi tiết</Link>}
      </div>
      {failedText ? <p role="status" className={styles.failed}>{failedText}</p> : children}
    </section>
  )
}
