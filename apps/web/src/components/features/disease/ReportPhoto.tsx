// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import styles from './ReportPhoto.module.css'

export const PHOTO_UNAVAILABLE_MESSAGE = 'Không tải được ảnh. Ảnh có thể đã bị xoá hoặc đang được kiểm tra.'

/** The report photo, or a notice when the object is missing from storage (deleted, quarantined by the scanner, or never uploaded). */
export function ReportPhoto({ src, alt = 'Ảnh bệnh', className }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={styles.unavailable} role="img" aria-label={PHOTO_UNAVAILABLE_MESSAGE}>
        <ImageOff size={24} aria-hidden="true" />
        <span>{PHOTO_UNAVAILABLE_MESSAGE}</span>
      </div>
    )
  }
  return <Image src={src} alt={alt} fill unoptimized className={className} onError={() => setFailed(true)} />
}
