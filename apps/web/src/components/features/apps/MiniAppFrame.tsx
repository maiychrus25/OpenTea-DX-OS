// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useState } from 'react'
import { readStoredTheme } from '@/components/ui/ThemeToggle/theme'
import styles from './MiniAppFrame.module.css'

/** Spec §6.6: forms and same-origin links work, scripts never run, and the app may leave the frame only on a click. */
const SANDBOX = 'allow-forms allow-same-origin allow-top-navigation-by-user-activation allow-downloads'

/** `src` with `theme=light|dark` from the stored choice; unchanged for the system setting or unreadable storage. */
function withStoredTheme(src: string): string {
  const theme = readStoredTheme()
  if (theme === 'system') return src
  const url = new URL(src, window.location.origin)
  url.searchParams.set('theme', theme)
  return `${url.pathname}${url.search}`
}

export function MiniAppFrame({ src, title }: { src: string; title: string }) {
  // Storage is read after mount, so the server and the first client render agree; the frame loads only once.
  const [themedSrc, setThemedSrc] = useState<string>()
  useEffect(() => setThemedSrc(withStoredTheme(src)), [src])

  return <iframe className={styles.frame} src={themedSrc} title={title} sandbox={SANDBOX} />
}
