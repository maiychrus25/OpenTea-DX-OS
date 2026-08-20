// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import { DocumentView } from '@/components/features/document/DocumentView'

export const metadata: Metadata = {
  title: 'Quản lý tài liệu P.A.R.A | Officer',
  description: 'Quản lý tài liệu canh tác theo cấu trúc P.A.R.A',
}

export default function DocumentPage() {
  return (
    <div className="h-full">
      <DocumentView />
    </div>
  )
}
