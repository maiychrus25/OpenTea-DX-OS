// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Plain module (no 'use client') so the server layout can inline themeInitScript.
export const THEME_STORAGE_KEY = 'opentea-theme'

export type ThemeChoice = 'light' | 'dark' | 'system'

// Runs before first paint. With 'system', nothing or unreadable storage, data-theme stays unset and the media query applies.
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export function readStoredTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
}
