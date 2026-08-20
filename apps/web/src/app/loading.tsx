// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-4" data-testid="skeleton" aria-busy="true" aria-label="Đang tải...">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-32 w-full mb-2 rounded-lg" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}
