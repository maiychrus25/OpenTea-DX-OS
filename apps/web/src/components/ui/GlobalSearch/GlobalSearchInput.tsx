// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import styles from '../../layout/TopBar/TopBar.module.css' // Import from TopBar for styling consistency

export function GlobalSearchInput() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div className={styles.searchWrap} onClick={() => setIsOpen(true)}>
        <Search size={18} className={styles.searchIcon} />
        <input 
          type="text" 
          placeholder="Tìm kiếm..." 
          aria-label="Tìm kiếm" 
          className={styles.searchInput} 
          readOnly 
          style={{ cursor: 'pointer' }}
        />
      </div>
      
      <GlobalSearch isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
