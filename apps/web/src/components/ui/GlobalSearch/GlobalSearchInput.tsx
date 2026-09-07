// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import topBarStyles from '../../layout/TopBar/TopBar.module.css'
import inputStyles from './GlobalSearchInput.module.css'

export function GlobalSearchInput() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
      setIsMac(true)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={`${topBarStyles.searchWrap} ${inputStyles.clickable}`}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        aria-label="Mở tìm kiếm nhanh (Ctrl + K)"
      >
        <Search size={18} className={topBarStyles.searchIcon} aria-hidden="true" />
        <span className={inputStyles.searchPlaceholder}>Tìm kiếm...</span>
        <kbd className={inputStyles.shortcutBadge} aria-hidden="true">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>

      <GlobalSearch isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
