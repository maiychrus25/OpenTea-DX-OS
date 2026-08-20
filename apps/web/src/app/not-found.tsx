// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import { Button } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-3xl font-bold text-foreground">404</h1>
      <h2 className="text-xl font-semibold text-foreground">Không tìm thấy trang</h2>
      <p className="text-muted-foreground mb-4">
        Đường dẫn bạn truy cập không tồn tại hoặc đã bị gỡ bỏ.
      </p>
      <Link href="/">
        <Button variant="text">Về trang chủ</Button>
      </Link>
    </div>
  )
}
