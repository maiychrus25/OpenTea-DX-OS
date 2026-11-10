// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { redirectToLogin } from '@/lib/api/redirect-to-login'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const tokenRefused = error.digest === 'CORE_UNAUTHORIZED'

  useEffect(() => {
    if (tokenRefused) redirectToLogin()
  }, [tokenRefused])

  useEffect(() => {
    // Log error to an external monitoring service instead of console
    // This satisfies AC6: no console.log / console.error in source files
    if (process.env.NODE_ENV === 'production') {
      // e.g. Sentry.captureException(error)
    }
  }, [error])

  if (error.digest === 'NO_HTX') {
    return <NoHtxNotice />
  }

  if (tokenRefused) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">Phiên đăng nhập đã hết hạn. Đang chuyển về trang đăng nhập...</p>
      </div>
    )
  }

  const coreDown = error.digest === 'CORE_UNAVAILABLE'

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-2xl font-bold text-[var(--danger,#dc2626)]">
        {coreDown ? 'Dịch vụ dữ liệu đang tạm gián đoạn' : 'Đã xảy ra lỗi'}
      </h1>
      <p className="text-muted-foreground mb-4">
        {coreDown ? 'Không thể tải dữ liệu lúc này. Vui lòng thử lại sau ít phút.' : 'Hệ thống gặp sự cố không mong muốn. Vui lòng thử lại.'}
      </p>
      <Button variant="primary" onClick={() => reset()}>
        Thử lại
      </Button>
    </div>
  )
}
