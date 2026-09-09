// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Metadata } from 'next'
import { DocumentView } from '@/components/features/document/DocumentView'

export const metadata: Metadata = {
  title: 'Kho tài liệu P.A.R.A | DX-AgriMarket',
}

export default function DocumentsPage() {
  return (
    <div className="h-full">
      <DocumentView />
    </div>
  )
}
