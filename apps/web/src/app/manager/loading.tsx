// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse" data-testid="skeleton" aria-busy="true" aria-label="Đang tải...">
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full mb-4" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
