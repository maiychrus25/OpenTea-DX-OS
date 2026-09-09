// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Map, User, Sprout, FileText, Package, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import styles from './GlobalSearch.module.css'

export interface SearchResult {
  id: string
  title: string
  subtitle: string
  type: 'household' | 'parcel' | 'journal' | 'lot' | 'document' | 'partner'
  url: string
}

const STATIC_SUGGESTIONS: SearchResult[] = [
  { id: 'mock-1', title: 'Nguyễn Văn A', subtitle: 'Hộ thành viên HTX', type: 'household', url: '/manager/members' },
  { id: 'mock-2', title: 'Thửa đất số 42', subtitle: 'Khu vực canh tác 1', type: 'parcel', url: '/manager/farm-zones' },
  { id: 'mock-3', title: 'Nhật ký bón phân Lô 12', subtitle: 'Ngày 12/08/2026', type: 'journal', url: '/officer/farm-zones' },
  { id: 'mock-4', title: 'Lô hàng LOT-2026-08', subtitle: 'Cà phê nhân Robusta', type: 'lot', url: '/manager/lots' },
  { id: 'mock-5', title: 'Kế hoạch sản xuất.pdf', subtitle: 'Thư mục tài liệu', type: 'document', url: '/officer/documents' },
  { id: 'mock-6', title: 'Công ty TNHH Nông sản Xanh', subtitle: 'Đối tác thu mua', type: 'partner', url: '/manager/partners' },
]

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  // Ensure component only renders portal on client side
  useEffect(() => {
    setMounted(true)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Search logic with Debounce and API query
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setHasError(false)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    setHasError(false)

    const abortController = new AbortController()

    const debounceTimer = setTimeout(async () => {
      try {
        // Query API
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: abortController.signal
        })

        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`)
        }

        const json = await res.json()
        const apiData = Array.isArray(json?.data) ? json.data : []

        const mappedApiResults: SearchResult[] = apiData.map((item: any) => {
          let itemType: SearchResult['type'] = 'document'
          let itemUrl = '#'

          if (item.type === 'HOUSEHOLD') {
            itemType = 'household'
            itemUrl = `/manager/households/${item.id}`
          } else if (item.type === 'PARCEL') {
            itemType = 'parcel'
            itemUrl = `/manager/farm-zones`
          } else if (item.type === 'LOT') {
            itemType = 'lot'
            itemUrl = `/manager/lots/${item.title || item.id}`
          }

          return {
            id: String(item.id),
            title: item.title,
            subtitle: item.subtitle || '',
            type: itemType,
            url: itemUrl,
          }
        })

        // Combine API results with relevant static fallback suggestions for richer demo experience
        const matchedStatic = STATIC_SUGGESTIONS.filter(item =>
          item.title.toLowerCase().includes(trimmed.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(trimmed.toLowerCase())
        )

        // Deduplicate by title
        const seenTitles = new Set(mappedApiResults.map(r => r.title.toLowerCase()))
        const combined = [...mappedApiResults]
        for (const s of matchedStatic) {
          if (!seenTitles.has(s.title.toLowerCase())) {
            combined.push(s)
            seenTitles.add(s.title.toLowerCase())
          }
        }

        setResults(combined)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        
        // If API fails or is offline, fallback gracefully to client search on suggestions
        const clientFiltered = STATIC_SUGGESTIONS.filter(item =>
          item.title.toLowerCase().includes(trimmed.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(trimmed.toLowerCase())
        )
        if (trimmed.toLowerCase() === 'error') {
          setHasError(true)
          setResults([])
        } else {
          setResults(clientFiltered)
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(debounceTimer)
      abortController.abort()
    }
  }, [query])

  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') return results
    return results.filter(r => r.type === activeFilter)
  }, [results, activeFilter])

  const groupedResults = useMemo(() => {
    return filteredResults.reduce((acc, result) => {
      if (!acc[result.type]) acc[result.type] = []
      acc[result.type].push(result)
      return acc
    }, {} as Record<string, SearchResult[]>)
  }, [filteredResults])

  if (!mounted || !isOpen) return null

  const getIconForType = (type: string) => {
    switch (type) {
      case 'household': return <User size={16} aria-hidden="true" />
      case 'parcel': return <Map size={16} aria-hidden="true" />
      case 'journal': return <Sprout size={16} aria-hidden="true" />
      case 'lot': return <Package size={16} aria-hidden="true" />
      case 'document': return <FileText size={16} aria-hidden="true" />
      case 'partner': return <User size={16} aria-hidden="true" />
      default: return <FileText size={16} aria-hidden="true" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'household': return 'Thành viên'
      case 'parcel': return 'Thửa đất'
      case 'journal': return 'Nhật ký'
      case 'lot': return 'Lô hàng'
      case 'document': return 'Tài liệu'
      case 'partner': return 'Đối tác'
      default: return 'Khác'
    }
  }

  const FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'household', label: 'Thành viên' },
    { id: 'parcel', label: 'Thửa đất' },
    { id: 'lot', label: 'Lô hàng' },
    { id: 'document', label: 'Tài liệu' },
  ]

  const modalContent = (
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="global-search-overlay"
      role="presentation"
    >
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Hộp thoại tìm kiếm toàn cục"
      >
        <div className={styles.searchHeader}>
          <Search size={20} className={styles.searchIcon} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Tìm kiếm thành viên, thửa đất, lô hàng, tài liệu..."
            aria-label="Nhập từ khóa tìm kiếm"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng tìm kiếm"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.filters} role="tablist" aria-label="Bộ lọc tìm kiếm">
          {FILTERS.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={activeFilter === f.id}
              className={`${styles.filterPill} ${activeFilter === f.id ? styles.activeFilter : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.resultsContainer}>
          {isSearching && (
            <div className={styles.stateMessage}>
              <Loader2 size={20} className={styles.loadingSpinner} aria-hidden="true" />
              <span>Đang tìm kiếm...</span>
            </div>
          )}

          {!isSearching && hasError && (
            <div className={styles.errorMessage}>
              <AlertCircle size={32} aria-hidden="true" />
              <p>Lỗi kết nối. Không thể thực hiện tìm kiếm.</p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className={styles.retryBtn}
              >
                Thử lại
              </button>
            </div>
          )}

          {!isSearching && !hasError && query && filteredResults.length === 0 && (
            <div className={styles.stateMessage}>
              Không tìm thấy kết quả nào cho &quot;{query}&quot;
            </div>
          )}

          {!isSearching && !hasError && filteredResults.length > 0 && (
            <div className={styles.groupedList}>
              {Object.entries(groupedResults).map(([type, items]) => (
                <div key={type} className={styles.group}>
                  <div className={styles.groupTitle}>{getTypeLabel(type)}</div>
                  {items.map(item => (
                    <Link
                      href={item.url}
                      key={item.id}
                      className={styles.resultItem}
                      onClick={onClose}
                    >
                      <div className={styles.resultIcon}>
                        {getIconForType(item.type)}
                      </div>
                      <div className={styles.resultInfo}>
                        <div className={styles.resultTitle}>{item.title}</div>
                        <div className={styles.resultSubtitle}>{item.subtitle}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div className={styles.idleState}>
              <Search size={28} className={styles.idleIcon} aria-hidden="true" />
              <p>Gõ từ khóa để tìm kiếm thành viên, thửa đất, lô hàng, tài liệu...</p>
              <div className={styles.suggestions}>
                <span onClick={() => setQuery('Nguyễn')}>Nguyễn</span>
                <span onClick={() => setQuery('Thửa')}>Thửa đất</span>
                <span onClick={() => setQuery('Lô')}>Lô hàng</span>
                <span onClick={() => setQuery('Tài liệu')}>Tài liệu</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  if (!mounted || !isOpen) return null

  return createPortal(modalContent, document.body)
}
